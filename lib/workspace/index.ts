/**
 * Workspace utilities
 */

export {
  validateWorkspace,
  validatePathExists,
  validatePathWithinRoots,
  validateGitHubRepoFormat,
  verifyGitHubRepoExists,
  validateWorkspaceName,
  getAllowedWorkspaceRoots,
  isGitRepository,
} from "./validation";
export type { ValidationResult, WorkspaceValidationOptions } from "./validation";

export {
  scanForRepositories,
  parseGitHubRepoFromRemote,
} from "./scanner";
export type { DiscoveredRepo, ScanOptions, ScanResult } from "./scanner";
