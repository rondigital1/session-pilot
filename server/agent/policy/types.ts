export type ToolCategory =
  | "file_read"
  | "file_write"
  | "git_read"
  | "git_write"
  | "github_read"
  | "github_write"
  | "shell_read"
  | "shell_write"
  | "network";

export interface ToolPolicy {
  category: ToolCategory;
  allowed: boolean;
  reason: string;
  allowlist?: string[];
  denylist?: string[];
}
