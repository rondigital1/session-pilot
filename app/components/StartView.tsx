import type { FocusWeights, UIWorkspace } from "@/server/types/domain";

interface StartViewProps {
  workspaces: UIWorkspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  userGoal: string;
  onChangeGoal: (goal: string) => void;
  timeBudget: number;
  onChangeTimeBudget: (minutes: number) => void;
  focusWeights: FocusWeights;
  onChangeFocusWeights: (weights: FocusWeights) => void;
  onStart: () => void;
  onManageWorkspaces?: () => void;
  isLoading: boolean;
}

export default function StartView({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  userGoal,
  onChangeGoal,
  timeBudget,
  onChangeTimeBudget,
  focusWeights,
  onChangeFocusWeights,
  onStart,
  onManageWorkspaces,
  isLoading,
}: StartViewProps) {
  const canStart = selectedWorkspaceId && userGoal.trim().length > 0;

  return (
    <div className="split split-narrow">
      <section className="panel">
        <div className="panel-header">
          <h2>Start a session</h2>
          <p>Pick a workspace and define today’s focus.</p>
        </div>

        <div className="form-group">
          <div className="form-label-row">
            <label className="form-label">Workspace</label>
            {onManageWorkspaces && (
              <button
                type="button"
                className="form-label-action"
                onClick={onManageWorkspaces}
              >
                Manage workspaces
              </button>
            )}
          </div>
          <select
            className="form-select"
            value={selectedWorkspaceId}
            onChange={(e) => onSelectWorkspace(e.target.value)}
          >
            <option value="">Select a workspace...</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.localPath})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">What are you driving forward?</label>
          <textarea
            className="form-textarea"
            placeholder="e.g., Ship auth flow, fix checkout regression, review PRs"
            value={userGoal}
            onChange={(e) => onChangeGoal(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Time budget: {timeBudget} minutes</label>
          <input
            type="range"
            className="slider"
            min="15"
            max="180"
            step="15"
            value={timeBudget}
            onChange={(e) => onChangeTimeBudget(Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Focus balance</label>

          <div className="slider-group">
            <div className="slider-header">
              <span className="slider-label">Bug fixes</span>
              <span className="slider-value">
                {Math.round(focusWeights.bugs * 100)}%
              </span>
            </div>
            <input
              type="range"
              className="slider"
              min="0"
              max="1"
              step="0.1"
              value={focusWeights.bugs}
              onChange={(e) =>
                onChangeFocusWeights({
                  ...focusWeights,
                  bugs: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span className="slider-label">New features</span>
              <span className="slider-value">
                {Math.round(focusWeights.features * 100)}%
              </span>
            </div>
            <input
              type="range"
              className="slider"
              min="0"
              max="1"
              step="0.1"
              value={focusWeights.features}
              onChange={(e) =>
                onChangeFocusWeights({
                  ...focusWeights,
                  features: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span className="slider-label">Refactoring</span>
              <span className="slider-value">
                {Math.round(focusWeights.refactor * 100)}%
              </span>
            </div>
            <input
              type="range"
              className="slider"
              min="0"
              max="1"
              step="0.1"
              value={focusWeights.refactor}
              onChange={(e) =>
                onChangeFocusWeights({
                  ...focusWeights,
                  refactor: Number(e.target.value),
                })
              }
            />
          </div>
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={onStart}
          disabled={!canStart || isLoading}
        >
          {isLoading ? "Starting..." : "Start session"}
        </button>
      </section>

      <aside className="panel panel-highlight side-panel">
        <div className="panel-header">
          <p className="eyebrow">What you'll get</p>
          <h3>Session toolkit</h3>
          <p>Short, focused outputs that keep your day on track.</p>
        </div>
        <div className="benefit-grid">
          <div className="benefit-card">
            <span className="benefit-number">01</span>
            <div>
              <h4>Auto-scanned plan</h4>
              <p>Signals from code and GitHub become a tight task list.</p>
            </div>
          </div>
          <div className="benefit-card">
            <span className="benefit-number">02</span>
            <div>
              <h4>Effort-aware tracking</h4>
              <p>Estimates, progress, and focus balance in one place.</p>
            </div>
          </div>
          <div className="benefit-card">
            <span className="benefit-number">03</span>
            <div>
              <h4>Deep task context</h4>
              <p>Checklists, notes, and links live with each task.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
