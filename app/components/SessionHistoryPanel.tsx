import type { UISessionHistoryItem } from "@/server/types/domain";
import { getSessionSummaryPreview } from "@/lib/session/summary";
import InlineMessage from "./InlineMessage";

interface SessionHistoryPanelProps {
  selectedWorkspaceId: string;
  workspacesCount: number;
  sessions: UISessionHistoryItem[];
  isLoading: boolean;
  errorMessage?: string | null;
  onResumeSession: (session: UISessionHistoryItem) => void;
  onReviewSession: (session: UISessionHistoryItem) => void;
  onManageWorkspaces?: () => void;
}

function formatSessionDate(isoDate: string) {
  return new Date(isoDate).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSessionActionLabel(session: UISessionHistoryItem) {
  if (session.status === "planning") {
    return "Resume planning";
  }

  if (session.status === "active") {
    return "Resume session";
  }

  if (session.status === "completed") {
    return "Review summary";
  }

  return "View details";
}

function getSessionStatusLabel(status: UISessionHistoryItem["status"]) {
  if (status === "active") {
    return "In progress";
  }

  if (status === "planning") {
    return "Planning";
  }

  if (status === "completed") {
    return "Completed";
  }

  return "Ended early";
}

export default function SessionHistoryPanel({
  selectedWorkspaceId,
  workspacesCount,
  sessions,
  isLoading,
  errorMessage,
  onResumeSession,
  onReviewSession,
  onManageWorkspaces,
}: SessionHistoryPanelProps) {
  const unfinishedSession = sessions.find(
    (session) => session.status === "planning" || session.status === "active"
  );
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const recentSessions = sessions
    .filter(
      (session) =>
        session.id !== unfinishedSession?.id &&
        session.id !== completedSessions[0]?.id
    )
    .slice(0, 4);
  const latestCompletedSummaryPreview = completedSessions[0]?.summary
    ? getSessionSummaryPreview(completedSessions[0].summary)
    : null;

  if (!selectedWorkspaceId) {
    return (
      <aside className="panel panel-highlight side-panel">
        <div className="panel-header">
          <p className="eyebrow">Start here</p>
          <h3>Move from idea to focused work</h3>
          <p>SessionPilot works best when you follow one tight loop from setup to review.</p>
        </div>

        <div className="workflow-list">
          <div className="workflow-card">
            <span className="benefit-number">01</span>
            <div>
              <h4>Connect a workspace</h4>
              <p>Pick the repo you want to scan so the planner can work from real project signals.</p>
            </div>
          </div>
          <div className="workflow-card">
            <span className="benefit-number">02</span>
            <div>
              <h4>Describe today&apos;s outcome</h4>
              <p>Use one sentence about what must move forward in this session.</p>
            </div>
          </div>
          <div className="workflow-card">
            <span className="benefit-number">03</span>
            <div>
              <h4>Review and start</h4>
              <p>Select the best tasks, start work, and come back later with your progress intact.</p>
            </div>
          </div>
        </div>

        {workspacesCount === 0 && onManageWorkspaces && (
          <InlineMessage tone="info" title="First run">
            <p>Add a workspace to unlock planning, resume, and session history.</p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onManageWorkspaces}
            >
              Add your first workspace
            </button>
          </InlineMessage>
        )}
      </aside>
    );
  }

  return (
    <aside className="panel panel-highlight side-panel">
      <div className="panel-header">
        <p className="eyebrow">Momentum</p>
        <h3>Pick up where you left off</h3>
        <p>Resume active work, review the last session, or start fresh with context.</p>
      </div>

      {errorMessage && (
        <InlineMessage tone="error" title="Session history unavailable">
          <p>{errorMessage}</p>
        </InlineMessage>
      )}

      {isLoading && (
        <div className="history-loading-card">
          <div className="progress-bar is-loading">
            <div className="progress-fill" />
          </div>
          <p className="text-muted">Loading recent sessions for this workspace...</p>
        </div>
      )}

      {!isLoading && unfinishedSession && (
        <section className="history-highlight-card">
          <div className="history-card-topline">
            <span className="badge badge-active">
              {getSessionStatusLabel(unfinishedSession.status)}
            </span>
            <span className="history-date">
              {formatSessionDate(unfinishedSession.startedAt)}
            </span>
          </div>
          <h4>{unfinishedSession.userGoal}</h4>
          <p className="text-muted">
            {unfinishedSession.status === "planning"
              ? "Your planning run is still open. Jump back in to finish shaping the session."
              : "Your task list is still active. Resume without losing progress or notes."}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => onResumeSession(unfinishedSession)}
          >
            {getSessionActionLabel(unfinishedSession)}
          </button>
        </section>
      )}

      {!isLoading && completedSessions[0] && (
        <section className="history-summary-card">
          <div className="history-card-topline">
            <span className="badge badge-muted">Last completed</span>
            <span className="history-date">
              {formatSessionDate(completedSessions[0].endedAt || completedSessions[0].startedAt)}
            </span>
          </div>
          <h4>{completedSessions[0].userGoal}</h4>
          {latestCompletedSummaryPreview && (
            <p className="history-summary-copy">{latestCompletedSummaryPreview}</p>
          )}
          {completedSessions[0].metrics && (
            <div className="history-metrics-row">
              <span>{completedSessions[0].metrics.tasksCompleted} tasks done</span>
              <span>{completedSessions[0].metrics.completionRate}% complete</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-outline btn-full"
            onClick={() => onReviewSession(completedSessions[0])}
          >
            Review summary
          </button>
        </section>
      )}

      {!isLoading && recentSessions.length > 0 && (
        <section className="history-list">
          <div className="panel-header compact-header">
            <h4>Recent sessions</h4>
            <p>Fast entry points back into your work.</p>
          </div>
          {recentSessions.map((session) => {
            const action =
              session.status === "completed" ? onReviewSession : onResumeSession;

            return (
              <div key={session.id} className="history-list-item">
                <div>
                  <div className="history-item-title">{session.userGoal}</div>
                  <div className="history-item-meta">
                    <span>{getSessionStatusLabel(session.status)}</span>
                    <span>{formatSessionDate(session.startedAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => action(session)}
                >
                  {getSessionActionLabel(session)}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {!isLoading && sessions.length === 0 && (
        <InlineMessage tone="info" title="No sessions yet">
          <p>Start your first session in this workspace. Completed sessions will show up here for review and reuse.</p>
        </InlineMessage>
      )}
    </aside>
  );
}
