/**
 * GitHub utility functions
 */

/**
 * Parse a GitHub repo string into owner and repo
 * Handles formats: "owner/repo", "https://github.com/owner/repo"
 */
export function parseGitHubRepo(
  repoString: string
): { owner: string; repo: string } | null {
  // Handle URL format
  const urlMatch = repoString.match(
    /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Handle owner/repo format
  const simpleMatch = repoString.match(/^([^\/]+)\/([^\/]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2] };
  }

  return null;
}

/**
 * Get the current GitHub user from environment variables
 * Checks multiple common env var names used by different systems
 */
export function getCurrentGitHubUser(): string | undefined {
  return (
    process.env.GITHUB_USER ||
    process.env.GITHUB_USERNAME ||
    process.env.GITHUB_LOGIN ||
    process.env.GITHUB_ACTOR
  );
}
