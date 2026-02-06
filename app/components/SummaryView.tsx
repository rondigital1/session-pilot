import type { SessionMetrics, UITask } from "@/server/types/domain";

interface SummaryViewProps {
  tasks: UITask[];
  summary: string;
  metrics?: SessionMetrics | null;
  userGoal: string;
  onNewSession: () => void;
}

export default function SummaryView({
  tasks,
  summary,
  metrics,
  userGoal,
  onNewSession,
}: SummaryViewProps) {
  const completedCount = metrics?.tasksCompleted ?? tasks.filter((t) => t.status === "completed").length;
  const taskTotal = metrics?.tasksTotal ?? tasks.length;
  const totalMinutes =
    metrics?.totalEstimatedMinutes ??
    tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  const completionRate =
    metrics?.completionRate ??
    (taskTotal > 0 ? Math.round((completedCount / taskTotal) * 100) : 0);
  const pendingCount = metrics?.tasksPending ?? taskTotal - completedCount;
  const skippedCount = metrics?.tasksSkipped ?? tasks.filter((t) => t.status === "skipped").length;
  const actualDurationMinutes = metrics?.actualDurationMinutes ?? 0;

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Session complete</p>
          <h2>{userGoal || "Session wrap-up"}</h2>
          <p className="hero-subtitle">
            {completedCount} of {taskTotal} tasks completed
          </p>
        </div>
        <span className="badge badge-muted">Done</span>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Session summary</h3>
          <p>Roll this into tomorrow’s kickoff.</p>
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
          <p>{summary}</p>
        </div>
      </section>

      <button className="btn btn-primary btn-full" onClick={onNewSession}>
        Start new session
      </button>
    </div>
  );
}
