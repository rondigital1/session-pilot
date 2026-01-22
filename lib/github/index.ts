/**
 * GitHub utilities
 *
 * Helpers for working with GitHub API data, including:
 * - Parsing repository strings
 * - Converting API responses to ScanSignals
 */

export { parseGitHubRepo, getCurrentGitHubUser } from "./utils";
export { commitToSignal, issueToSignal, prToSignal, prReviewCommentToSignal } from "./converters";
