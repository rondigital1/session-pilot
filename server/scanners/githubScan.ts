/**
 * GitHub Repository Scanner
 *
 * Fetches signals from GitHub that inform session planning:
 * - Open issues (especially assigned to you)
 * - Open pull requests (needing review or your PRs needing attention)
 * - Recent commits (potential follow-up work)
 * - PR review comments (feedback to address)
 */

import type { ScanSignal } from "@/server/types/domain";
import { Octokit } from "octokit";
import {
  parseGitHubRepo,
  commitToSignal,
  issueToSignal,
  prToSignal,
  getMockGitHubSignals,
} from "@/lib/github";

export interface GitHubScanOptions {
  owner: string;
  repo: string;
  sessionId: string;
  includeIssues?: boolean;
  includePRs?: boolean;
  includeRecentCommits?: boolean;
  assignedToMe?: boolean;
  maxIssues?: number;
  maxPRs?: number;
}

export interface GitHubScanResult {
  signals: ScanSignal[];
  rateLimitRemaining: number;
  errors: string[];
}

// Re-export utilities for convenience
export { parseGitHubRepo, getMockGitHubSignals };

/**
 * Scan a GitHub repository for signals
 *
 * Fetches and processes:
 * 1. Open issues (filtered by assignee if assignedToMe is true)
 * 2. Open PRs (filtered to your PRs or review requests if assignedToMe is true)
 * 3. Recent commits on the default branch
 *
 * Priority is computed based on:
 * - Age (older issues = lower priority unless urgent)
 * - Labels (bug, urgent, etc. = higher priority)
 * - Assignee (assigned to you = higher priority)
 * - Activity (recent comments = higher priority)
 *
 * @param options - Scan configuration
 * @returns Promise with signals and metadata
 */
export async function scanGitHubRepository(
  options: GitHubScanOptions
): Promise<GitHubScanResult> {
  const signals: ScanSignal[] = [];
  const errors: string[] = [];
  let rateLimitRemaining = -1;

  if (!process.env.GITHUB_TOKEN) {
    errors.push("GITHUB_TOKEN not configured");
    return { signals, rateLimitRemaining, errors };
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    userAgent: "session-pilot/v1.0.0",
  });

  // Get current user for assignee filtering
  let currentUser: string | undefined;
  if (options.assignedToMe) {
    try {
      const { data: user } = await octokit.rest.users.getAuthenticated();
      currentUser = user.login;
    } catch (error) {
      errors.push(`Error fetching current user: ${error}`);
    }
  }

  // Fetch recent commits
  if (options.includeRecentCommits) {
    try {
      const response = await octokit.rest.repos.listCommits({
        owner: options.owner,
        repo: options.repo,
        per_page: 10,
      });
      signals.push(
        ...response.data.map((commit) =>
          commitToSignal(commit, options.sessionId)
        )
      );
      rateLimitRemaining = parseInt(
        response.headers["x-ratelimit-remaining"] ?? "-1",
        10
      );
    } catch (error) {
      errors.push(`Error fetching commits: ${error}`);
    }
  }

  // Fetch issues
  if (options.includeIssues) {
    try {
      const response = await octokit.rest.issues.listForRepo({
        owner: options.owner,
        repo: options.repo,
        state: "open",
        assignee: options.assignedToMe && currentUser ? currentUser : undefined,
        per_page: options.maxIssues || 20,
      });
      // Filter out pull requests (GitHub API returns PRs in issues endpoint)
      const issues = response.data.filter((issue) => !issue.pull_request);
      signals.push(
        ...issues.map((issue) => issueToSignal(issue, options.sessionId))
      );
      rateLimitRemaining = parseInt(
        response.headers["x-ratelimit-remaining"] ?? "-1",
        10
      );
    } catch (error) {
      errors.push(`Error fetching issues: ${error}`);
    }
  }

  // Fetch PRs
  if (options.includePRs) {
    try {
      const response = await octokit.rest.pulls.list({
        owner: options.owner,
        repo: options.repo,
        state: "open",
        per_page: options.maxPRs || 10,
      });
      let prs = response.data;
      // If assignedToMe is set, filter PRs to those authored by or requesting review from current user
      if (options.assignedToMe && currentUser) {
        prs = prs.filter(
          (pr) =>
            pr.user?.login === currentUser ||
            pr.requested_reviewers?.some(
              (reviewer) => reviewer?.login === currentUser
            )
        );
      }
      signals.push(...prs.map((pr) => prToSignal(pr, options.sessionId)));
      rateLimitRemaining = parseInt(
        response.headers["x-ratelimit-remaining"] ?? "-1",
        10
      );
    } catch (error) {
      errors.push(`Error fetching PRs: ${error}`);
    }
  }

  return { signals, rateLimitRemaining, errors };
}
