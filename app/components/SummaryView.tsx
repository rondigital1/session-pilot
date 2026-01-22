import type { UITask } from "@/server/types/domain";

interface SummaryViewProps {
  tasks: UITask[];
  summary: string;
  userGoal: string;
  onNewSession: () => void;
}

export default function SummaryView({
  tasks,
  summary,
  userGoal,
  onNewSession,
}: SummaryViewProps) {
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  const completionRate =
    tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Session complete</p>
          <h2>{userGoal || "Session wrap-up"}</h2>
          <p className="hero-subtitle">
            {completedCount} of {tasks.length} tasks completed
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
              {completedCount} / {tasks.length}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Time allocated</span>
            <span className="summary-value">{totalMinutes} min</span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Completion rate</span>
            <span className="summary-value">{completionRate}%</span>
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
