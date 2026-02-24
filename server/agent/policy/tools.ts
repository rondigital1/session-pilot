import type { ToolPolicy } from "./types";

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

export const SENSITIVE_FILE_PATTERNS = [
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

export const SAFE_READ_COMMANDS = [
  "ls", "find", "grep", "rg", "ag", "cat", "head", "tail", "wc",
  "less", "more", "file", "stat", "which", "whereis", "type", "pwd",
  "echo", "printf", "date", "tree", "du", "df", "diff", "sort", "uniq",
  "cut", "tr", "awk", "sed", "xargs", "jq", "yq",
];

export const DANGEROUS_COMMANDS = [
  "rm", "rmdir", "mv", "cp", "mkdir", "touch", "chmod", "chown",
  "chgrp", "ln", "unlink", "install", "shred", "truncate",
];

export const ALWAYS_DANGEROUS = [
  "sudo", "su", "doas", "pkexec", "eval", "exec", "source", ".",
  "bash", "sh", "zsh", "curl", "wget", "nc", "ncat", "netcat",
];

export const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
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

export const SAFE_GIT_SUBCOMMANDS = [
  "status", "log", "diff", "show", "blame", "branch", "tag",
  "ls-files", "ls-tree", "cat-file", "rev-parse", "describe",
  "shortlog", "reflog", "stash", "remote", "config",
];

export const DANGEROUS_GIT_SUBCOMMANDS = [
  "commit", "push", "pull", "fetch", "checkout", "switch", "reset",
  "rebase", "merge", "cherry-pick", "revert", "am", "apply", "add",
  "rm", "mv", "restore", "clean", "gc", "prune", "init", "clone",
];
