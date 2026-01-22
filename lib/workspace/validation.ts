/**
 * Workspace Validation
 *
 * Validates workspace configuration before creation/update:
 * - Local path existence and accessibility
 * - Path restrictions to allowed workspace roots
 * - GitHub repo format validation
 * - Optional GitHub repo existence verification
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
 * If not set, allows any path (for development convenience)
 */
export function getAllowedWorkspaceRoots(): string[] {
  const roots = process.env.SESSIONPILOT_WORKSPACE_ROOTS;
  if (!roots) {
    return [];
  }
  return roots
    .split(",")
    .map((p) => p.trim())
    .map((p) => path.resolve(p))
    .filter((p) => p.length > 0);
}

/**
 * Validate that a path exists and is a directory
 */
export async function validatePathExists(localPath: string): Promise<ValidationResult> {
  try {
    const resolved = path.resolve(localPath);
    const stat = await fs.stat(resolved);

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
    return { valid: false, error: `Failed to access path: ${error}` };
  }
}

/**
 * Validate that a path is within allowed workspace roots
 *
 * If no roots are configured (SESSIONPILOT_WORKSPACE_ROOTS not set),
 * this check is skipped and any path is allowed.
 */
export function validatePathWithinRoots(localPath: string): ValidationResult {
  const allowedRoots = getAllowedWorkspaceRoots();

  // If no roots configured, allow any path
  if (allowedRoots.length === 0) {
    return { valid: true };
  }

  const resolved = path.resolve(localPath);

  for (const root of allowedRoots) {
    // Check if the path starts with the root (is inside it)
    if (resolved.startsWith(root + path.sep) || resolved === root) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    error: `Path must be within allowed workspace roots: ${allowedRoots.join(", ")}`,
  };
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
    // Validate local path exists
    const existsResult = await validatePathExists(localPath);
    if (!existsResult.valid) {
      return existsResult;
    }

    // Validate path is within allowed roots
    const rootsResult = validatePathWithinRoots(localPath);
    if (!rootsResult.valid) {
      return rootsResult;
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
