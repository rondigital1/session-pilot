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
import { DEFAULT_POLICIES, SENSITIVE_FILE_PATTERNS } from "./policy/tools";
import { validateShellCommand } from "./policy/shell";
import { validateGitCommand } from "./policy/git";

export type { ToolCategory, ToolPolicy } from "./policy/types";
export { DEFAULT_POLICIES, validateShellCommand, validateGitCommand };

import type { ToolCategory, ToolPolicy } from "./policy/types";

// =============================================================================
// Pattern Matching Utilities
// =============================================================================

function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`, "i");
}

function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  const regex = globToRegex(pattern);
  return regex.test(value);
}

function getFilename(filePath: string): string {
  return path.basename(filePath);
}

// =============================================================================
// Policy Checker Functions
// =============================================================================

export function checkPolicy(
  category: ToolCategory,
  action: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  const policy = policies.find((p) => p.category === category);

  if (!policy) {
    return { allowed: false, reason: `Unknown tool category: ${category}` };
  }

  if (!policy.allowed) {
    return { allowed: false, reason: policy.reason };
  }

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

  return { allowed: true, reason: policy.reason };
}

export function validateFilePath(
  filePath: string,
  workspaceRoot: string,
  policies: ToolPolicy[] = DEFAULT_POLICIES
): { allowed: boolean; reason: string } {
  const normalizedPath = path.resolve(filePath);
  const normalizedRoot = path.resolve(workspaceRoot);

  if (
    !normalizedPath.startsWith(normalizedRoot + path.sep) &&
    normalizedPath !== normalizedRoot
  ) {
    return {
      allowed: false,
      reason: `Path is outside workspace: ${filePath} is not within ${workspaceRoot}`,
    };
  }

  const filename = getFilename(normalizedPath);

  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (matchesPattern(filename, pattern)) {
      return {
        allowed: false,
        reason: `File matches sensitive pattern: ${pattern}`,
      };
    }
  }

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

  return { allowed: true, reason: "File path is valid and within workspace" };
}

export function getPolicySummary(
  policies: ToolPolicy[] = DEFAULT_POLICIES
): string {
  const allowed = policies.filter((p) => p.allowed).map((p) => p.category);
  const denied = policies.filter((p) => !p.allowed).map((p) => p.category);
  return `Allowed: ${allowed.join(", ")}. Denied: ${denied.join(", ")}.`;
}

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
      if (action.trim().startsWith("git ")) {
        return validateGitCommand(action, policies);
      }
      return validateShellCommand(action, policies);

    case "git":
      return validateGitCommand(action, policies);

    default:
      return { allowed: false, reason: `Unknown tool type: ${toolType}` };
  }
}
