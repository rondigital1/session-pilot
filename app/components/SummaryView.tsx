import type { SessionMetrics, SessionStatus, UITask } from "@/server/types/domain";
import { parseSessionSummary } from "@/lib/session/summary";
import InlineMessage from "./InlineMessage";

interface SummaryViewProps {
  tasks: UITask[];
  summary: string;
  metrics?: SessionMetrics | null;
  status?: SessionStatus;
  userGoal: string;
  onNewSession: () => void;
  onPlanFollowUp?: () => void;
}

export default function SummaryView({
  tasks,
  summary,
  metrics,
  status = "completed",
  userGoal,
  onNewSession,
  onPlanFollowUp,
}: SummaryViewProps) {
  const parsedSummary = parseSessionSummary(summary);
  const completedCount = metrics?.tasksCompleted ?? tasks.filter((t) => t.status === "completed").length;
  const taskTotal = metrics?.tasksTotal ?? tasks.length;
  const pendingTasks = tasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress"
  );
  const totalMinutes =
    metrics?.totalEstimatedMinutes ??
    tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  const completionRate =
    metrics?.completionRate ??
    (taskTotal > 0 ? Math.round((completedCount / taskTotal) * 100) : 0);
  const pendingCount = metrics?.tasksPending ?? pendingTasks.length;
  const skippedCount = metrics?.tasksSkipped ?? tasks.filter((t) => t.status === "skipped").length;
  const actualDurationMinutes = metrics?.actualDurationMinutes ?? 0;
  const carryForwardTasks = pendingTasks.slice(0, 4);
  const endedEarly = status === "cancelled";

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">{endedEarly ? "Session ended early" : "Session complete"}</p>
          <h2>{userGoal || "Session wrap-up"}</h2>
          <p className="hero-subtitle">
            {endedEarly
              ? `${completedCount} of ${taskTotal} tasks completed before the session stopped`
              : `${completedCount} of ${taskTotal} tasks completed`}
          </p>
        </div>
        <span className="badge badge-muted">{endedEarly ? "Ended early" : "Done"}</span>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Session summary</h3>
          <p>
            {endedEarly
              ? "Use this to decide what to carry forward before the next session."
              : "Roll this into tomorrow’s kickoff."}
          </p>
        </div>
        <div className="summary-grid">
          <div className="summary-stat">
            <span className="summary-label">Tasks completed</span>
            <span className="summary-value">
              {completedCount} / {taskTotal}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Time allocated</span>
            <span className="summary-value">{totalMinutes} min</span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Tasks pending</span>
            <span className="summary-value">{pendingCount}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Tasks skipped</span>
            <span className="summary-value">{skippedCount}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Completion rate</span>
            <span className="summary-value">{completionRate}%</span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Actual duration</span>
            <span className="summary-value">{actualDurationMinutes} min</span>
          </div>
        </div>
        <div className="summary-copy">
          {parsedSummary.map((section) => (
            <div
              key={section.title}
              className={`summary-section ${
                section.title === "Accomplished" ? "summary-section-accent" : ""
              }`}
            >
              <p className="summary-section-title">{section.title}</p>
              {section.kind === "list" ? (
                <ul className="summary-section-list">
                  {section.content.map((item, index) => (
                    <li key={`${section.title}-${index}`} className="summary-section-item">
                      <span className="summary-section-marker" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                section.content.map((paragraph, index) => (
                  <p key={`${section.title}-${index}`}>{paragraph}</p>
                ))
              )}
            </div>
          ))}
        </div>
      </section>

      {pendingCount > 0 ? (
        <section className="panel panel-highlight">
          <div className="panel-header">
            <h3>Carry this forward</h3>
            <p>Keep your next session pointed at the work that still needs attention.</p>
          </div>
          <ul className="summary-follow-up-list">
            {carryForwardTasks.map((task) => (
              <li key={task.id} className="summary-follow-up-item">
                <span className="summary-follow-up-title">{task.title}</span>
                <span className="summary-follow-up-meta">
                  {task.estimatedMinutes ? `${task.estimatedMinutes} min` : "Needs follow-up"}
                </span>
              </li>
            ))}
          </ul>
          {pendingCount > carryForwardTasks.length && (
            <p className="form-hint">
              {pendingCount - carryForwardTasks.length} more tasks are still open in this session.
            </p>
          )}
        </section>
      ) : (
        <InlineMessage tone="success" title="Clean handoff">
          <p>This session wrapped without leftover tasks. Start the next one fresh when you&apos;re ready.</p>
        </InlineMessage>
      )}

      <div className="summary-actions">
        {pendingCount > 0 && onPlanFollowUp && (
          <button className="btn btn-outline btn-full" onClick={onPlanFollowUp}>
            Plan follow-up session
          </button>
        )}
        <button className="btn btn-primary btn-full" onClick={onNewSession}>
          Start fresh session
        </button>
      </div>
    </div>
  );
}
