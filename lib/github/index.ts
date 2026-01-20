/**
 * GitHub utilities
 *
 * Helpers for working with GitHub API data, including:
 * - Parsing repository strings
 * - Converting API responses to ScanSignals
 * - Mock data for testing
 */

export { parseGitHubRepo, getCurrentGitHubUser } from "./utils";
export { commitToSignal, issueToSignal, prToSignal } from "./converters";
export { getMockGitHubSignals } from "./mocks";
