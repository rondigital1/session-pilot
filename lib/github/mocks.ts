/**
 * Mock GitHub data for scaffolding and testing
 */

import type { ScanSignal } from "@/server/types/domain";

/**
 * Get mock GitHub signals for scaffolding/testing
 */
export function getMockGitHubSignals(
  sessionId: string,
  owner: string,
  repo: string
): ScanSignal[] {
  return [
    {
      id: `sig_gh_${sessionId}_1`,
      source: "github",
      signalType: "open_issue",
      title: "Bug: Login fails on Safari",
      description: "Users report authentication issues on Safari 16+",
      url: `https://github.com/${owner}/${repo}/issues/42`,
      priority: 0.8,
      metadata: {
        issueNumber: 42,
        labels: ["bug", "high-priority"],
        createdAt: "2024-01-10T10:00:00Z",
      },
    },
    {
      id: `sig_gh_${sessionId}_2`,
      source: "github",
      signalType: "open_pr",
      title: "PR: Add dark mode support",
      description: "Ready for review - implements dark mode toggle",
      url: `https://github.com/${owner}/${repo}/pull/45`,
      priority: 0.6,
      metadata: {
        prNumber: 45,
        author: "colleague",
        reviewRequested: true,
        draft: false,
      },
    },
    {
      id: `sig_gh_${sessionId}_3`,
      source: "github",
      signalType: "open_pr",
      title: "PR: Refactor auth module (YOUR PR)",
      description: "Your PR has review comments to address",
      url: `https://github.com/${owner}/${repo}/pull/43`,
      priority: 0.85,
      metadata: {
        prNumber: 43,
        author: "you",
        hasRequestedChanges: true,
        commentsCount: 3,
      },
    },
    {
      id: `sig_gh_${sessionId}_4`,
      source: "github",
      signalType: "recent_commit",
      title: "Recent commit: Update API error handling",
      description: "Merged yesterday - may need follow-up work",
      url: `https://github.com/${owner}/${repo}/commit/abc123`,
      priority: 0.4,
      metadata: {
        sha: "abc123",
        author: "you",
        message: "Update API error handling",
        date: "2024-01-14T15:30:00Z",
      },
    },
  ];
}
