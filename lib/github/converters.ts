/**
 * GitHub API response to ScanSignal converters
 */

import type { ScanSignal } from "@/server/types/domain";
import { getCurrentGitHubUser } from "./utils";

/**
 * Convert a GitHub commit to a ScanSignal
 *
 * Priority scoring considers:
 * - Commit within last 3 days (+0.15)
 * - Your commit (+0.1)
 * - Fix/bug/hotfix in message (+0.1)
 * - Commit older than 14 days (-0.1)
 */
export function commitToSignal(
  _commit: unknown,
  _sessionId: string
): ScanSignal {
  const commit = _commit as {
    sha?: string;
    html_url?: string;
    commit?: {
      message?: string;
      author?: { date?: string; name?: string } | null;
    } | null;
    author?: { login?: string } | null;
  };

  const message = commit.commit?.message ?? "";
  const [subject, ...rest] = message.split(/\r?\n/);
  const description = rest.join("\n").trim() || undefined;
  const commitDate = commit.commit?.author?.date ?? undefined;
  const createdAt = commitDate ? new Date(commitDate) : null;
  const now = Date.now();
  const ageMs = createdAt ? now - createdAt.getTime() : null;

  const currentUser = getCurrentGitHubUser();
  const isYourCommit = currentUser
    ? commit.author?.login === currentUser
    : false;

  const subjectLower = subject.toLowerCase();

  let priority = 0.45;
  if (ageMs !== null && ageMs <= 3 * 24 * 60 * 60 * 1000) {
    priority += 0.15;
  }
  if (isYourCommit) {
    priority += 0.1;
  }
  if (
    subjectLower.includes("fix") ||
    subjectLower.includes("bug") ||
    subjectLower.includes("hotfix")
  ) {
    priority += 0.1;
  }
  if (ageMs !== null && ageMs >= 14 * 24 * 60 * 60 * 1000) {
    priority -= 0.1;
  }

  const sha = commit.sha ?? `unknown`;
  const shortSha = sha.slice(0, 7);
  const authorName =
    commit.author?.login ?? commit.commit?.author?.name ?? "unknown";

  return {
    id: `${_sessionId}_sig_gh_commit_${sha}`,
    source: "github",
    signalType: "recent_commit",
    title: `Recent commit: ${subject || shortSha}`,
    description,
    url: commit.html_url,
    priority: Math.min(1, Math.max(0, priority)),
    metadata: {
      sha,
      author: authorName,
      message: message || undefined,
      date: commitDate,
      isYourCommit,
    },
  };
}

/**
 * Convert a GitHub issue to a ScanSignal
 *
 * Priority scoring considers:
 * - Bug labels (+0.2)
 * - Urgent/priority labels (+0.2)
 * - Assigned to current user (+0.2)
 * - Created within last 7 days (+0.1)
 * - 5+ comments (+0.1)
 * - Created over 30 days ago (-0.1)
 */
export function issueToSignal(
  _issue: unknown,
  _sessionId: string
): ScanSignal {
  const issue = _issue as {
    id?: number | string;
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string;
    labels?: Array<{ name?: string } | string>;
    assignee?: { login?: string } | null;
    assignees?: Array<{ login?: string } | null> | null;
    user?: { login?: string } | null;
    created_at?: string;
    comments?: number;
  };

  const labels = (issue.labels ?? [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((label): label is string => Boolean(label));
  const labelsLower = labels.map((label) => label.toLowerCase());

  const createdAt = issue.created_at ? new Date(issue.created_at) : null;
  const now = Date.now();
  const ageMs = createdAt ? now - createdAt.getTime() : null;

  let priority = 0.5;
  if (labelsLower.some((label) => label.includes("bug"))) {
    priority += 0.2;
  }
  if (
    labelsLower.some(
      (label) => label.includes("urgent") || label.includes("priority")
    )
  ) {
    priority += 0.2;
  }

  const currentUser = getCurrentGitHubUser();
  const assignedToCurrentUser = currentUser
    ? issue.assignee?.login === currentUser ||
      (issue.assignees ?? []).some((assignee) => assignee?.login === currentUser)
    : false;
  if (assignedToCurrentUser) {
    priority += 0.2;
  }

  if (ageMs !== null && ageMs <= 7 * 24 * 60 * 60 * 1000) {
    priority += 0.1;
  }

  if ((issue.comments ?? 0) >= 5) {
    priority += 0.1;
  }

  if (ageMs !== null && ageMs >= 30 * 24 * 60 * 60 * 1000) {
    priority -= 0.1;
  }

  const idSuffix = issue.id ?? issue.number ?? "unknown";

  return {
    id: `${_sessionId}_sig_gh_issue_${idSuffix}`,
    source: "github",
    signalType: "open_issue",
    title: issue.title ?? "Untitled issue",
    description: issue.body ?? undefined,
    url: issue.html_url,
    priority: Math.min(1, Math.max(0, priority)),
    metadata: {
      issueNumber: issue.number,
      labels,
      createdAt: issue.created_at,
      commentsCount: issue.comments,
      author: issue.user?.login,
      assignedToCurrentUser,
    },
  };
}

/**
 * Convert a GitHub PR to a ScanSignal
 *
 * Priority scoring considers:
 * - Your PR (+0.3)
 * - Needs your review (+0.3)
 * - Has failing checks (+0.2)
 * - Has requested changes (+0.2)
 * - Has merge conflicts (+0.2)
 * - Draft PR (-0.2)
 */
export function prToSignal(
  _pr: unknown,
  _sessionId: string
): ScanSignal {
  const pr = _pr as {
    id?: number | string;
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string;
    user?: { login?: string } | null;
    draft?: boolean;
    requested_reviewers?: Array<{ login?: string } | null> | null;
    mergeable?: boolean | null;
    mergeable_state?: string | null;
    review_decision?: string | null;
  };

  const currentUser = getCurrentGitHubUser();

  const isYourPr = currentUser
    ? pr.user?.login === currentUser
    : false;

  const needsYourReview = currentUser
    ? (pr.requested_reviewers ?? []).some(
        (reviewer) => reviewer?.login === currentUser
      )
    : false;

  const mergeableState = (pr.mergeable_state ?? "").toLowerCase();
  const hasFailingChecks =
    mergeableState === "failure" || mergeableState === "unstable";
  const hasMergeConflicts =
    mergeableState === "dirty" || pr.mergeable === false;
  const hasRequestedChanges =
    (pr.review_decision ?? "").toLowerCase() === "changes_requested";

  let priority = 0.5;
  if (isYourPr) {
    priority += 0.3;
  }
  if (needsYourReview) {
    priority += 0.3;
  }
  if (hasFailingChecks) {
    priority += 0.2;
  }
  if (hasRequestedChanges) {
    priority += 0.2;
  }
  if (hasMergeConflicts) {
    priority += 0.2;
  }
  if (pr.draft) {
    priority -= 0.2;
  }

  const idSuffix = pr.id ?? pr.number ?? "unknown";

  return {
    id: `${_sessionId}_sig_gh_pr_${idSuffix}`,
    source: "github",
    signalType: "open_pr",
    title: pr.title ?? "Untitled PR",
    description: pr.body ?? undefined,
    url: pr.html_url,
    priority: Math.min(1, Math.max(0, priority)),
    metadata: {
      prNumber: pr.number,
      author: pr.user?.login,
      reviewRequested: needsYourReview,
      isYourPr,
      draft: Boolean(pr.draft),
      hasFailingChecks,
      hasRequestedChanges,
      hasMergeConflicts,
      mergeableState: pr.mergeable_state ?? undefined,
    },
  };
}

/**
 * Convert a GitHub PR review comment to a ScanSignal
 *
 * PR review comments are inline code comments left during code review.
 * These often contain actionable feedback that needs to be addressed.
 *
 * Priority scoring considers:
 * - Comment on your PR (+0.3)
 * - Comment is unresolved (+0.2)
 * - Comment within last 3 days (+0.15)
 * - Comment contains action words like "fix", "change", "should" (+0.1)
 */
export function prReviewCommentToSignal(
  _comment: unknown,
  prNumber: number,
  prAuthor: string | undefined,
  _sessionId: string
): ScanSignal {
  const comment = _comment as {
    id?: number;
    body?: string;
    path?: string;
    line?: number | null;
    original_line?: number | null;
    html_url?: string;
    user?: { login?: string } | null;
    created_at?: string;
    updated_at?: string;
    in_reply_to_id?: number;
  };

  const currentUser = getCurrentGitHubUser();
  const isOnYourPr = currentUser ? prAuthor === currentUser : false;
  const isYourComment = currentUser ? comment.user?.login === currentUser : false;

  const createdAt = comment.created_at ? new Date(comment.created_at) : null;
  const now = Date.now();
  const ageMs = createdAt ? now - createdAt.getTime() : null;

  const body = comment.body ?? "";
  const bodyLower = body.toLowerCase();

  // Check for actionable language in the comment
  const hasActionableLanguage =
    bodyLower.includes("fix") ||
    bodyLower.includes("change") ||
    bodyLower.includes("should") ||
    bodyLower.includes("need") ||
    bodyLower.includes("must") ||
    bodyLower.includes("todo") ||
    bodyLower.includes("please") ||
    bodyLower.includes("consider");

  let priority = 0.5;

  // Higher priority if it's on your PR (you need to address it)
  if (isOnYourPr && !isYourComment) {
    priority += 0.3;
  }

  // Recent comments are more relevant
  if (ageMs !== null && ageMs <= 3 * 24 * 60 * 60 * 1000) {
    priority += 0.15;
  }

  // Actionable comments are higher priority
  if (hasActionableLanguage) {
    priority += 0.1;
  }

  // Skip if it's your own comment (you don't need to address your own feedback)
  if (isYourComment) {
    priority -= 0.3;
  }

  const idSuffix = comment.id ?? "unknown";
  const filePath = comment.path ?? "unknown file";
  const line = comment.line ?? comment.original_line;

  // Create a concise title from the comment body
  const titlePreview = body.length > 60 ? body.slice(0, 57) + "..." : body;
  const cleanTitle = titlePreview.replace(/\r?\n/g, " ").trim();

  return {
    id: `${_sessionId}_sig_gh_pr_comment_${idSuffix}`,
    source: "github",
    signalType: "pr_review_comment",
    title: `PR #${prNumber} comment: ${cleanTitle || "Review feedback"}`,
    description: body || undefined,
    filePath,
    lineNumber: line ?? undefined,
    url: comment.html_url,
    priority: Math.min(1, Math.max(0, priority)),
    metadata: {
      prNumber,
      commentId: comment.id,
      author: comment.user?.login,
      isOnYourPr,
      isYourComment,
      hasActionableLanguage,
      createdAt: comment.created_at,
    },
  };
}
