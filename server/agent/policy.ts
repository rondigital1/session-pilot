/**
 * Tool Permission Policy Module
 *
 * This module defines what tools/actions the Claude agent is allowed to perform.
 * SessionPilot is designed to be READ-ONLY during planning - no file modifications,
 * commits, or PR creation.
 *
 * Key functions:
 * - checkPolicy(): Validates tool usage against category policies
 * - validateFilePath(): Ensures file access is within workspace bounds
 * - validateShellCommand(): Validates shell commands are safe
 * - validateGitCommand(): Validates git commands are read-only
 */

import path from "path";

// =============================================================================
// Tool Categories
// =============================================================================

export type ToolCategory =
  | "file_read" // Reading files, directory listing
  | "file_write" // Writing, editing, deleting files
  | "git_read" // git status, log, diff, blame
  | "git_write" // git commit, push, branch, checkout
  | "github_read" // List issues, PRs, comments
  | "github_write" // Create issues, PRs, comments
  | "shell_read" // Read-only shell commands (ls, cat, etc.)
  | "shell_write" // Modifying shell commands
  | "network"; // HTTP requests, API calls

// =============================================================================
// Policy Definitions
// =============================================================================

export interface ToolPolicy {
  category: ToolCategory;
  allowed: boolean;
  reason: string;
  allowlist?: string[]; // Specific allowed commands/patterns
  denylist?: string[]; // Specific denied commands/patterns
}

/**
 * Default policy for MVP - read-only operations only
 *
 * TODO(SessionPilot): Make this configurable per-workspace or per-session.
 * Some users may want to allow certain write operations.
 */
export const DEFAULT_POLICIES: ToolPolicy[] = [
  {
    category: "file_read",
    allowed: true,
    reason: "Needed for code analysis and planning",
    allowlist: ["*.ts", "*.tsx", "*.js", "*.jsx", "*.json", "*.md", "*.yaml", "*.yml"],
    denylist: [".env*", "*secret*", "*credential*", "*.pem", "*.key"],
  },
  {
    category: "file_write",
    allowed: false,
    reason: "MVP is read-only; file editing is out of scope",
  },
  {
    category: "git_read",
    allowed: true,
    reason: "Needed to understand repo state and history",
    allowlist: ["status", "log", "diff", "blame", "show", "branch --list"],
  },
  {
    category: "git_write",
    allowed: false,
    reason: "MVP is read-only; git modifications are out of scope",
    denylist: ["commit", "push", "checkout", "reset", "rebase", "merge"],
  },
  {
    category: "github_read",
    allowed: true,
    reason: "Needed to fetch issues, PRs, and comments for planning",
  },
  {
    category: "github_write",
    allowed: false,
    reason: "MVP is read-only; GitHub modifications are out of scope",
  },
  {
    category: "shell_read",
    allowed: true,
    reason: "Needed for read-only commands like ls, find, grep",
    allowlist: ["ls", "find", "grep", "rg", "cat", "head", "tail", "wc"],
    denylist: ["rm", "mv", "cp", "chmod", "chown", "sudo"],
  },
  {
    category: "shell_write",
    allowed: false,
    reason: "MVP is read-only; shell modifications are out of scope",
  },
  {
    category: "network",
    allowed: true,
    reason: "Needed for GitHub API calls",
    allowlist: ["api.github.com"],
  },
];

// =============================================================================
// Pattern Matching Utilities
// =============================================================================

/**
 * Convert a glob-style pattern to a regex
 *
 * Supports:
 * - * matches any characters except path separators
 * - ** matches any characters including path separators
 * - ? matches a single character
 * - Character classes [abc] and negated [!abc]
 *
 * @param pattern - Glob pattern (e.g., "*.ts", ".env*", "src/**\/*.tsx")
 * @returns RegExp for matching
 */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    // Escape regex special chars (except glob chars)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Convert ** to match anything (including path separators)
    .replace(/\\\*\\\*/g, ".*")
    // Convert * to match anything except path separators
    .replace(/\\\*/g, "[^/]*")
    // Convert ? to match single character
    .replace(/\?/g, ".");

  return new RegExp(`^${regex}$`, "i");
}

/**
 * Check if a string matches a glob-style pattern
 *
 * @param value - The string to check
 * @param pattern - The glob pattern to match against
 * @returns true if the value matches the pattern
 */
function matchesPattern(value: string, pattern: string): boolean {
  // Direct string match (for commands like "ls", "grep")
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }

  // Glob pattern match
  const regex = globToRegex(pattern);
  return regex.test(value);
}

/**
 * Extract the filename from a path for pattern matching
 */
function getFilename(filePath: string): string {
  return path.basename(filePath);
}

// =============================================================================
// Policy Checker Functions
// =============================================================================

/**
 * Check if a tool action is allowed by policy
 *
 * Validates an action against the policy's allowlist and denylist:
 * 1. If the category is disabled, deny immediately
 * 2. Check denylist first - if any pattern matches, deny
 * 3. If allowlist exists, action must match at least one pattern
 *
 * @param category - The category of tool being used
 * @param action - The specific action (e.g., "git commit", "read package.json")
 * @param policies - Policy configuration (defaults to DEFAULT_POLICIES)
 * @returns Object with allowed boolean and reason string
 */
export function checkPolicy(
  category: ToolCategory,
  action: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  const policy = policies.find((p) => p.category === category);

  if (!policy) {
    return {
      allowed: false,
      reason: `Unknown tool category: ${category}`,
    };
  }

  if (!policy.allowed) {
    return {
      allowed: false,
      reason: policy.reason,
    };
  }

  // Check denylist first - any match means deny
  if (policy.denylist) {
    for (const pattern of policy.denylist) {
      if (matchesPattern(action, pattern)) {
        return {
          allowed: false,
          reason: `Action matches denylist pattern: ${pattern}`,
        };
      }
    }
  }

  // If allowlist exists, action must match at least one pattern
  if (policy.allowlist && policy.allowlist.length > 0) {
    const matchesAllowlist = policy.allowlist.some((p) =>
      matchesPattern(action, p)
    );
    if (!matchesAllowlist) {
      return {
        allowed: false,
        reason: `Action not in allowlist. Allowed patterns: ${policy.allowlist.join(", ")}`,
      };
    }
  }

  return {
    allowed: true,
    reason: policy.reason,
  };
}

/** Sensitive file patterns that should never be read */
const SENSITIVE_FILE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*secret*",
  "*credential*",
  "*password*",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  ".npmrc",
  ".pypirc",
  "*.keystore",
  "*.jks",
];

/**
 * Validate a file path against policy
 *
 * Performs the following checks:
 * 1. Normalizes the path (resolves .. and .)
 * 2. Verifies path is within workspace bounds (no path traversal)
 * 3. Checks against sensitive file patterns
 * 4. Validates file extension if allowlist exists
 *
 * @param filePath - The file path to validate
 * @param workspaceRoot - The workspace root directory
 * @param policies - Policy configuration (defaults to DEFAULT_POLICIES)
 * @returns Object with allowed boolean and reason string
 */
export function validateFilePath(
  filePath: string,
  workspaceRoot: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  // Normalize both paths for comparison
  const normalizedPath = path.resolve(filePath);
  const normalizedRoot = path.resolve(workspaceRoot);

  // Check path is within workspace bounds
  if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
    return {
      allowed: false,
      reason: `Path is outside workspace: ${filePath} is not within ${workspaceRoot}`,
    };
  }

  // Get filename for pattern matching
  const filename = getFilename(normalizedPath);

  // Check against sensitive file patterns
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (matchesPattern(filename, pattern)) {
      return {
        allowed: false,
        reason: `File matches sensitive pattern: ${pattern}`,
      };
    }
  }

  // Check against file_read policy's denylist
  const fileReadPolicy = policies.find((p) => p.category === "file_read");
  if (fileReadPolicy?.denylist) {
    for (const pattern of fileReadPolicy.denylist) {
      if (matchesPattern(filename, pattern)) {
        return {
          allowed: false,
          reason: `File matches policy denylist: ${pattern}`,
        };
      }
    }
  }

  // Check file extension against allowlist if it exists
  if (fileReadPolicy?.allowlist && fileReadPolicy.allowlist.length > 0) {
    const matchesAllowlist = fileReadPolicy.allowlist.some((pattern) =>
      matchesPattern(filename, pattern)
    );
    if (!matchesAllowlist) {
      return {
        allowed: false,
        reason: `File type not in allowlist. Allowed: ${fileReadPolicy.allowlist.join(", ")}`,
      };
    }
  }

  return {
    allowed: true,
    reason: "File path is valid and within workspace",
  };
}

/** Read-only shell commands that are safe */
const SAFE_READ_COMMANDS = [
  "ls",
  "find",
  "grep",
  "rg",
  "ag",
  "cat",
  "head",
  "tail",
  "wc",
  "less",
  "more",
  "file",
  "stat",
  "which",
  "whereis",
  "type",
  "pwd",
  "echo",
  "printf",
  "date",
  "tree",
  "du",
  "df",
  "diff",
  "sort",
  "uniq",
  "cut",
  "tr",
  "awk",
  "sed", // read-only when not using -i
  "xargs", // depends on piped command
  "jq",
  "yq",
];

/** Commands that modify the filesystem */
const DANGEROUS_COMMANDS = [
  "rm",
  "rmdir",
  "mv",
  "cp",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "chgrp",
  "ln",
  "unlink",
  "install",
  "shred",
  "truncate",
];

/** Commands that are always dangerous */
const ALWAYS_DANGEROUS = [
  "sudo",
  "su",
  "doas",
  "pkexec",
  "eval",
  "exec",
  "source",
  ".",
  "bash",
  "sh",
  "zsh",
  "curl",  // can download and execute
  "wget",
  "nc",
  "ncat",
  "netcat",
];

/** Dangerous shell patterns */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: />/, reason: "Output redirection (file write)" },
  { pattern: />>/, reason: "Append redirection (file write)" },
  { pattern: /\$\(/, reason: "Command substitution" },
  { pattern: /`[^`]+`/, reason: "Backtick command substitution" },
  { pattern: /\bxargs\s+.*\brm\b/, reason: "Piped delete operation" },
  { pattern: /\|\s*sh\b/, reason: "Pipe to shell" },
  { pattern: /\|\s*bash\b/, reason: "Pipe to bash" },
  { pattern: /;\s*rm\b/, reason: "Chained delete operation" },
  { pattern: /&&\s*rm\b/, reason: "Conditional delete operation" },
  { pattern: /\bsed\s+-i/, reason: "In-place file modification" },
];

/**
 * Extract the base command from a shell command string
 *
 * Handles:
 * - Environment variables: VAR=value command
 * - Absolute paths: /usr/bin/ls
 * - Relative paths: ./script.sh
 *
 * @param command - Full command string
 * @returns The base command name
 */
function extractBaseCommand(command: string): string {
  // Remove leading environment variable assignments
  let cleaned = command.trim();
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/.test(cleaned)) {
    cleaned = cleaned.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, "");
  }

  // Get the first word (the command)
  const firstWord = cleaned.split(/\s+/)[0] || "";

  // Extract basename if it's a path
  return path.basename(firstWord);
}

/**
 * Validate a shell command against policy
 *
 * Performs comprehensive validation:
 * 1. Extracts the base command from the string
 * 2. Checks for always-dangerous commands
 * 3. Checks for dangerous filesystem commands
 * 4. Checks for dangerous shell patterns
 * 5. Validates against shell_read policy
 *
 * @param command - The shell command to validate
 * @param policies - Policy configuration (defaults to DEFAULT_POLICIES)
 * @returns Object with allowed boolean and reason string
 */
export function validateShellCommand(
  command: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    return {
      allowed: false,
      reason: "Empty command",
    };
  }

  // Extract the base command
  const baseCommand = extractBaseCommand(trimmedCommand);

  // Check for always-dangerous commands
  if (ALWAYS_DANGEROUS.includes(baseCommand)) {
    return {
      allowed: false,
      reason: `Command "${baseCommand}" is not allowed for security reasons`,
    };
  }

  // Check for dangerous filesystem commands
  if (DANGEROUS_COMMANDS.includes(baseCommand)) {
    return {
      allowed: false,
      reason: `Command "${baseCommand}" modifies the filesystem and is not allowed`,
    };
  }

  // Check for dangerous patterns
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return {
        allowed: false,
        reason: `Command contains dangerous pattern: ${reason}`,
      };
    }
  }

  // Check against shell_read policy
  const shellReadPolicy = policies.find((p) => p.category === "shell_read");

  if (shellReadPolicy?.denylist) {
    for (const deniedCmd of shellReadPolicy.denylist) {
      if (baseCommand === deniedCmd || trimmedCommand.includes(deniedCmd)) {
        return {
          allowed: false,
          reason: `Command "${deniedCmd}" is in the denylist`,
        };
      }
    }
  }

  // Verify command is in the safe list or allowlist
  const isInSafeList = SAFE_READ_COMMANDS.includes(baseCommand);
  const isInAllowlist = shellReadPolicy?.allowlist?.includes(baseCommand);

  if (!isInSafeList && !isInAllowlist) {
    return {
      allowed: false,
      reason: `Command "${baseCommand}" is not in the allowed commands list`,
    };
  }

  return {
    allowed: true,
    reason: "Command is safe for read-only execution",
  };
}

/** Read-only git subcommands */
const SAFE_GIT_SUBCOMMANDS = [
  "status",
  "log",
  "diff",
  "show",
  "blame",
  "branch", // with --list
  "tag", // without -d
  "ls-files",
  "ls-tree",
  "cat-file",
  "rev-parse",
  "describe",
  "shortlog",
  "reflog",
  "stash", // with list
  "remote", // with -v
  "config", // with --get or --list
];

/** Git subcommands that modify state */
const DANGEROUS_GIT_SUBCOMMANDS = [
  "commit",
  "push",
  "pull",
  "fetch", // can modify refs
  "checkout",
  "switch",
  "reset",
  "rebase",
  "merge",
  "cherry-pick",
  "revert",
  "am",
  "apply",
  "add",
  "rm",
  "mv",
  "restore",
  "clean",
  "gc",
  "prune",
  "init",
  "clone",
];

/**
 * Validate a git command against policy
 *
 * Ensures git commands are read-only:
 * 1. Extracts the git subcommand
 * 2. Checks against dangerous subcommands
 * 3. Validates against git_read policy
 *
 * @param command - The full git command (e.g., "git log --oneline")
 * @param policies - Policy configuration (defaults to DEFAULT_POLICIES)
 * @returns Object with allowed boolean and reason string
 */
export function validateGitCommand(
  command: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  const trimmedCommand = command.trim();

  // Extract git subcommand
  const gitMatch = trimmedCommand.match(/^git\s+(\S+)/);
  if (!gitMatch) {
    return {
      allowed: false,
      reason: "Not a valid git command",
    };
  }

  const subcommand = gitMatch[1];

  // Check for dangerous subcommands first
  if (DANGEROUS_GIT_SUBCOMMANDS.includes(subcommand)) {
    return {
      allowed: false,
      reason: `Git subcommand "${subcommand}" modifies repository state and is not allowed`,
    };
  }

  // Check git_read policy
  const gitReadPolicy = policies.find((p) => p.category === "git_read");

  if (!gitReadPolicy?.allowed) {
    return {
      allowed: false,
      reason: gitReadPolicy?.reason ?? "Git read operations are not allowed",
    };
  }

  // Check against git_write denylist
  const gitWritePolicy = policies.find((p) => p.category === "git_write");
  if (gitWritePolicy?.denylist?.includes(subcommand)) {
    return {
      allowed: false,
      reason: `Git subcommand "${subcommand}" is in the denylist`,
    };
  }

  // Verify subcommand is in safe list or allowlist
  const isInSafeList = SAFE_GIT_SUBCOMMANDS.includes(subcommand);
  const isInAllowlist = gitReadPolicy.allowlist?.some((pattern) =>
    subcommand.startsWith(pattern.split(" ")[0])
  );

  if (!isInSafeList && !isInAllowlist) {
    return {
      allowed: false,
      reason: `Git subcommand "${subcommand}" is not in the allowed list`,
    };
  }

  // Additional check for branch command (only --list is safe)
  if (subcommand === "branch" && !trimmedCommand.includes("--list") && !trimmedCommand.includes("-l")) {
    // Allow "git branch" with no args (shows branches)
    const hasArgs = trimmedCommand.replace(/^git\s+branch\s*/, "").trim().length > 0;
    if (hasArgs && !trimmedCommand.includes("-a") && !trimmedCommand.includes("-r")) {
      return {
        allowed: false,
        reason: 'Git branch command requires --list flag or no arguments',
      };
    }
  }

  return {
    allowed: true,
    reason: "Git command is safe for read-only execution",
  };
}

/**
 * Get human-readable policy summary
 *
 * Returns a formatted summary of what operations are allowed/denied.
 */
export function getPolicySummary(
  policies: ToolPolicy[] = DEFAULT_POLICIES
): string {
  const allowed = policies.filter((p) => p.allowed).map((p) => p.category);
  const denied = policies.filter((p) => !p.allowed).map((p) => p.category);

  return `Allowed: ${allowed.join(", ")}. Denied: ${denied.join(", ")}.`;
}

/**
 * Validate any tool action based on its type
 *
 * Convenience function that routes to the appropriate validator based on context.
 *
 * @param toolType - The type of tool (file, shell, git)
 * @param action - The action to validate
 * @param workspaceRoot - The workspace root (for file validation)
 * @param policies - Policy configuration
 */
export function validateToolAction(
  toolType: "file" | "shell" | "git",
  action: string,
  workspaceRoot?: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  switch (toolType) {
    case "file":
      if (!workspaceRoot) {
        return {
          allowed: false,
          reason: "Workspace root is required for file validation",
        };
      }
      return validateFilePath(action, workspaceRoot, policies);

    case "shell":
      // Check if it's a git command
      if (action.trim().startsWith("git ")) {
        return validateGitCommand(action, policies);
      }
      return validateShellCommand(action, policies);

    case "git":
      return validateGitCommand(action, policies);

    default:
      return {
        allowed: false,
        reason: `Unknown tool type: ${toolType}`,
      };
  }
}
