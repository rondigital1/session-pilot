/**
 * Workspace Validation
 *
 * Validates workspace configuration before creation/update:
 * - Local path existence and accessibility
 * - Path restrictions to allowed workspace roots (with symlink resolution)
 * - GitHub repo format validation
 * - Optional GitHub repo existence verification
 * 
 * SECURITY: This module is critical for preventing path traversal attacks.
 * All path validation uses realpath() to resolve symlinks before checking.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { parseGitHubRepo } from "@/lib/github";
import { Octokit } from "octokit";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface WorkspaceValidationOptions {
  name: string;
  localPath?: string | null;
  githubRepo?: string | null;
  verifyGitHubRepo?: boolean;
}

/**
 * Get allowed workspace roots from environment variable
 *
 * SESSIONPILOT_WORKSPACE_ROOTS should be a comma-separated list of paths
 * e.g., "/Users/dev/projects,/home/dev/code"
 *
 * SECURITY: This MUST be configured in production environments.
 * If not set, workspace creation will be rejected.
 */
export function getAllowedWorkspaceRoots(): string[] {
  const roots = process.env.SESSIONPILOT_WORKSPACE_ROOTS;
  if (!roots) {
    return [];
  }
  return roots
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Check if running in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Validate that a path exists and is a directory
 * 
 * SECURITY: Uses realpath to resolve symlinks before validation
 */
export async function validatePathExists(localPath: string): Promise<ValidationResult> {
  try {
    // First resolve symlinks to get the real path
    const realPath = await fs.realpath(localPath);
    const stat = await fs.stat(realPath);

    if (!stat.isDirectory()) {
      return { valid: false, error: "Path exists but is not a directory" };
    }

    return { valid: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { valid: false, error: "Path does not exist" };
    }
    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      return { valid: false, error: "Path is not accessible (permission denied)" };
    }
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      return { valid: false, error: "Path contains a symlink loop" };
    }
    return { valid: false, error: `Failed to access path: ${error}` };
  }
}

/**
 * Check if a path is a subpath of a root directory
 * 
 * SECURITY: Uses path.relative() which handles edge cases like:
 * - Trailing slashes
 * - Case sensitivity (though we use realpath first)
 * - .. traversal attempts
 */
function isSubpathOf(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  
  // If relative path starts with ".." or is absolute, it's not a subpath
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

/**
 * Validate that a path is within allowed workspace roots
 *
 * SECURITY NOTES:
 * - Uses realpath() to resolve symlinks before checking
 * - Requires SESSIONPILOT_WORKSPACE_ROOTS in production
 * - In development, allows any path with a warning
 * 
 * @param localPath - The path to validate
 * @returns Validation result
 */
export async function validatePathWithinRoots(localPath: string): Promise<ValidationResult> {
  const allowedRoots = getAllowedWorkspaceRoots();

  // SECURITY: Require explicit configuration in production
  if (allowedRoots.length === 0) {
    if (isDevelopment()) {
      console.warn(
        "[Security Warning] SESSIONPILOT_WORKSPACE_ROOTS is not configured. " +
        "Any local path is allowed in development mode. " +
        "Set this variable in production to restrict workspace paths."
      );
      return { valid: true };
    }
    
    return {
      valid: false,
      error: "SESSIONPILOT_WORKSPACE_ROOTS must be configured. " +
        "Set this environment variable to a comma-separated list of allowed workspace directories.",
    };
  }

  try {
    // SECURITY: Resolve symlinks to get the real path
    // This prevents symlink-based path traversal attacks
    const realPath = await fs.realpath(localPath);

    for (const root of allowedRoots) {
      try {
        // Resolve the root path as well (it might also contain symlinks)
        const realRoot = await fs.realpath(root);

        // Check if paths are equal or if realPath is a subpath of realRoot
        if (realPath === realRoot || isSubpathOf(realPath, realRoot)) {
          return { valid: true };
        }
      } catch {
        // Root path doesn't exist or isn't accessible - skip it
        continue;
      }
    }

    return {
      valid: false,
      error: `Path must be within allowed workspace roots: ${allowedRoots.join(", ")}`,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { valid: false, error: "Path does not exist" };
    }
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      return { valid: false, error: "Path contains a symlink loop" };
    }
    return { valid: false, error: `Failed to resolve path: ${error}` };
  }
}

/**
 * Check if a path appears to be a git repository
 */
export async function isGitRepository(localPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(path.resolve(localPath), ".git");
    const stat = await fs.stat(gitPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Validate GitHub repo format
 *
 * Accepts formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 */
export function validateGitHubRepoFormat(githubRepo: string): ValidationResult {
  const parsed = parseGitHubRepo(githubRepo);

  if (!parsed) {
    return {
      valid: false,
      error: 'Invalid GitHub repo format. Expected "owner/repo" or GitHub URL',
    };
  }

  // Additional validation for owner/repo names
  const validNamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

  if (!validNamePattern.test(parsed.owner)) {
    return {
      valid: false,
      error: "Invalid GitHub owner name",
    };
  }

  if (!validNamePattern.test(parsed.repo)) {
    return {
      valid: false,
      error: "Invalid GitHub repository name",
    };
  }

  return { valid: true };
}

/**
 * Verify that a GitHub repository exists and is accessible
 *
 * Requires GITHUB_TOKEN to be configured. If not configured,
 * skips verification and returns valid.
 */
export async function verifyGitHubRepoExists(githubRepo: string): Promise<ValidationResult> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    // Can't verify without token, skip check
    return { valid: true };
  }

  const parsed = parseGitHubRepo(githubRepo);
  if (!parsed) {
    return { valid: false, error: "Invalid GitHub repo format" };
  }

  try {
    const octokit = new Octokit({ auth: token });
    await octokit.rest.repos.get({
      owner: parsed.owner,
      repo: parsed.repo,
    });
    return { valid: true };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return { valid: false, error: "GitHub repository not found" };
    }
    if (status === 403) {
      return { valid: false, error: "No access to GitHub repository" };
    }
    return { valid: false, error: `Failed to verify GitHub repository: ${error}` };
  }
}

/**
 * Validate workspace name
 */
export function validateWorkspaceName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Workspace name is required" };
  }

  if (name.length > 100) {
    return { valid: false, error: "Workspace name must be 100 characters or less" };
  }

  return { valid: true };
}

/**
 * Perform full workspace validation
 *
 * Validates all workspace fields and returns the first error encountered,
 * or success if all validations pass.
 *
 * Either localPath or githubRepo (or both) must be provided.
 * 
 * SECURITY: This function performs comprehensive validation including:
 * - Symlink resolution via realpath()
 * - Path containment checks against allowed roots
 * - GitHub repo format validation
 */
export async function validateWorkspace(
  options: WorkspaceValidationOptions
): Promise<ValidationResult> {
  const { name, localPath, githubRepo, verifyGitHubRepo = false } = options;

  // Validate name
  const nameResult = validateWorkspaceName(name);
  if (!nameResult.valid) {
    return nameResult;
  }

  // Require at least one of localPath or githubRepo
  if (!localPath && !githubRepo) {
    return {
      valid: false,
      error: "Either localPath or githubRepo must be provided",
    };
  }

  // Validate local path if provided
  if (localPath) {
    // SECURITY: Validate path is within allowed roots FIRST
    // This uses realpath() to resolve symlinks
    const rootsResult = await validatePathWithinRoots(localPath);
    if (!rootsResult.valid) {
      return rootsResult;
    }

    // Then validate path exists (also uses realpath)
    const existsResult = await validatePathExists(localPath);
    if (!existsResult.valid) {
      return existsResult;
    }
  }

  // Validate GitHub repo if provided
  if (githubRepo) {
    const formatResult = validateGitHubRepoFormat(githubRepo);
    if (!formatResult.valid) {
      return formatResult;
    }

    // Optionally verify repo exists
    if (verifyGitHubRepo) {
      const repoExistsResult = await verifyGitHubRepoExists(githubRepo);
      if (!repoExistsResult.valid) {
        return repoExistsResult;
      }
    }
  }

  return { valid: true };
}
