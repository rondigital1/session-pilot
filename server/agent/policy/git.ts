import type { ToolPolicy } from "./types";
import { SAFE_GIT_SUBCOMMANDS, DANGEROUS_GIT_SUBCOMMANDS } from "./tools";

export function validateGitCommand(
  command: string,
  policies: ToolPolicy[]
): { allowed: boolean; reason: string } {
  const trimmedCommand = command.trim();

  const gitMatch = trimmedCommand.match(/^git\s+(\S+)/);
  if (!gitMatch) {
    return { allowed: false, reason: "Not a valid git command" };
  }

  const subcommand = gitMatch[1];

  if (DANGEROUS_GIT_SUBCOMMANDS.includes(subcommand)) {
    return {
      allowed: false,
      reason: `Git subcommand "${subcommand}" modifies repository state and is not allowed`,
    };
  }

  const gitReadPolicy = policies.find((p) => p.category === "git_read");

  if (!gitReadPolicy?.allowed) {
    return {
      allowed: false,
      reason: gitReadPolicy?.reason ?? "Git read operations are not allowed",
    };
  }

  const gitWritePolicy = policies.find((p) => p.category === "git_write");
  if (gitWritePolicy?.denylist?.includes(subcommand)) {
    return {
      allowed: false,
      reason: `Git subcommand "${subcommand}" is in the denylist`,
    };
  }

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

  if (
    subcommand === "branch" &&
    !trimmedCommand.includes("--list") &&
    !trimmedCommand.includes("-l")
  ) {
    const hasArgs = trimmedCommand.replace(/^git\s+branch\s*/, "").trim().length > 0;
    if (hasArgs && !trimmedCommand.includes("-a") && !trimmedCommand.includes("-r")) {
      return {
        allowed: false,
        reason: "Git branch command requires --list flag or no arguments",
      };
    }
  }

  return { allowed: true, reason: "Git command is safe for read-only execution" };
}
