/**
 * Client-side workspace validation utilities
 *
 * Provides immediate validation feedback for the workspace form.
 * Server-side validation in lib/workspace/validation.ts handles
 * the authoritative checks (path existence, GitHub API verification).
 */

export interface FieldValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate GitHub repo format
 *
 * Accepts:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 * - "github.com/owner/repo"
 */
export function validateGitHubRepo(value: string): FieldValidation {
  if (!value.trim()) {
    return { valid: true }; // Empty is allowed (optional field)
  }

  const trimmed = value.trim();

  // Pattern for owner/repo format
  const ownerRepoPattern = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?\/[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

  // Pattern for GitHub URL
  const githubUrlPattern = /^(https?:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?)\/([a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?)(\.git)?$/;

  if (ownerRepoPattern.test(trimmed)) {
    return { valid: true };
  }

  if (githubUrlPattern.test(trimmed)) {
    return { valid: true };
  }

  // Check for common mistakes
  if (trimmed.includes("github.com") && !githubUrlPattern.test(trimmed)) {
    return {
      valid: false,
      error: "Invalid GitHub URL format. Expected: https://github.com/owner/repo",
    };
  }

  if (trimmed.includes("/")) {
    // Looks like they're trying owner/repo format
    const parts = trimmed.split("/");
    if (parts.length !== 2) {
      return {
        valid: false,
        error: "Invalid format. Expected: owner/repo",
      };
    }
    if (!parts[0]) {
      return { valid: false, error: "Owner name is required" };
    }
    if (!parts[1]) {
      return { valid: false, error: "Repository name is required" };
    }
    return {
      valid: false,
      error: "Invalid characters in owner or repo name",
    };
  }

  return {
    valid: false,
    error: 'Invalid format. Use "owner/repo" or a GitHub URL',
  };
}

/**
 * Validate local path format
 *
 * Basic client-side checks:
 * - Must be an absolute path (starts with / on Unix or drive letter on Windows)
 * - No obviously invalid characters
 * - Not empty if provided
 *
 * Note: Actual path existence is verified server-side.
 */
export function validateLocalPath(value: string): FieldValidation {
  if (!value.trim()) {
    return { valid: true }; // Empty is allowed (optional field)
  }

  const trimmed = value.trim();

  // Check for absolute path (Unix-style or Windows-style)
  const isUnixAbsolute = trimmed.startsWith("/");
  const isWindowsAbsolute = /^[a-zA-Z]:\\/.test(trimmed);
  const isTildePath = trimmed.startsWith("~"); // Allow ~ for home directory

  if (!isUnixAbsolute && !isWindowsAbsolute && !isTildePath) {
    return {
      valid: false,
      error: "Path must be absolute (start with / or ~)",
    };
  }

  // Check for invalid characters that are never valid in paths
  const invalidChars = /[\0<>"|?*]/;
  if (invalidChars.test(trimmed)) {
    return {
      valid: false,
      error: "Path contains invalid characters",
    };
  }

  // Check for double slashes (except at start for network paths)
  if (/(?<!^)\/\//.test(trimmed) || /\\\\(?!^)/.test(trimmed)) {
    return {
      valid: false,
      error: "Path contains invalid double slashes",
    };
  }

  // Warn about trailing slashes (not invalid, but normalized)
  if (trimmed.length > 1 && (trimmed.endsWith("/") || trimmed.endsWith("\\"))) {
    return { valid: true }; // Valid but could note it will be normalized
  }

  return { valid: true };
}

/**
 * Validate workspace name
 */
export function validateWorkspaceName(value: string): FieldValidation {
  if (!value.trim()) {
    return { valid: false, error: "Name is required" };
  }

  if (value.length > 100) {
    return { valid: false, error: "Name must be 100 characters or less" };
  }

  return { valid: true };
}

/**
 * Validate entire workspace form
 */
export function validateWorkspaceForm(data: {
  name: string;
  localPath: string;
  githubRepo: string;
}): {
  valid: boolean;
  errors: {
    name?: string;
    localPath?: string;
    githubRepo?: string;
    form?: string;
  };
} {
  const nameValidation = validateWorkspaceName(data.name);
  const pathValidation = validateLocalPath(data.localPath);
  const repoValidation = validateGitHubRepo(data.githubRepo);

  const errors: {
    name?: string;
    localPath?: string;
    githubRepo?: string;
    form?: string;
  } = {};

  if (!nameValidation.valid) {
    errors.name = nameValidation.error;
  }

  if (!pathValidation.valid) {
    errors.localPath = pathValidation.error;
  }

  if (!repoValidation.valid) {
    errors.githubRepo = repoValidation.error;
  }

  // At least one of localPath or githubRepo must be provided
  if (!data.localPath.trim() && !data.githubRepo.trim()) {
    errors.form = "Either local path or GitHub repository is required";
  }

  const valid =
    nameValidation.valid &&
    pathValidation.valid &&
    repoValidation.valid &&
    (!!data.localPath.trim() || !!data.githubRepo.trim());

  return { valid, errors };
}
