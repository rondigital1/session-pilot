import path from "path";
import type { ToolPolicy } from "./types";
import {
  SAFE_READ_COMMANDS,
  DANGEROUS_COMMANDS,
  ALWAYS_DANGEROUS,
  DANGEROUS_PATTERNS,
} from "./tools";

function extractBaseCommand(command: string): string {
  let cleaned = command.trim();
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/.test(cleaned)) {
    cleaned = cleaned.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, "");
  }
  const firstWord = cleaned.split(/\s+/)[0] || "";
  return path.basename(firstWord);
}

export function validateShellCommand(
  command: string,
  policies: ToolPolicy[]
): { allowed: boolean; reason: string } {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    return { allowed: false, reason: "Empty command" };
  }

  const baseCommand = extractBaseCommand(trimmedCommand);

  if (ALWAYS_DANGEROUS.includes(baseCommand)) {
    return {
      allowed: false,
      reason: `Command "${baseCommand}" is not allowed for security reasons`,
    };
  }

  if (DANGEROUS_COMMANDS.includes(baseCommand)) {
    return {
      allowed: false,
      reason: `Command "${baseCommand}" modifies the filesystem and is not allowed`,
    };
  }

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return {
        allowed: false,
        reason: `Command contains dangerous pattern: ${reason}`,
      };
    }
  }

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

  const isInSafeList = SAFE_READ_COMMANDS.includes(baseCommand);
  const isInAllowlist = shellReadPolicy?.allowlist?.includes(baseCommand);

  if (!isInSafeList && !isInAllowlist) {
    return {
      allowed: false,
      reason: `Command "${baseCommand}" is not in the allowed commands list`,
    };
  }

  return { allowed: true, reason: "Command is safe for read-only execution" };
}
