import type {
  FocusWeights,
  SystemHealthReport,
  UISessionHistoryItem,
  UIWorkspace,
} from "@/server/types/domain";
import InlineMessage from "./InlineMessage";
import SessionHistoryPanel from "./SessionHistoryPanel";

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
  errorMessage?: string | null;
  workspaceLoadError?: string | null;
  prefillMessage?: string | null;
  systemHealth?: SystemHealthReport | null;
  systemHealthError?: string | null;
  sessionHistory?: UISessionHistoryItem[];
  isLoadingSessionHistory?: boolean;
  sessionHistoryError?: string | null;
  onResumeSession?: (session: UISessionHistoryItem) => void;
  onReviewSession?: (session: UISessionHistoryItem) => void;
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
  errorMessage,
  workspaceLoadError,
  prefillMessage,
  systemHealth,
  systemHealthError,
  sessionHistory = [],
  isLoadingSessionHistory = false,
  sessionHistoryError,
  onResumeSession,
  onReviewSession,
}: StartViewProps) {
  const canStart = selectedWorkspaceId && userGoal.trim().length > 0;
  const hasBlockingSystemIssue = systemHealth
    ? Object.values(systemHealth.checks).some((check) => check.status === "error")
    : false;

  return (
    <div className="split split-narrow">
      <section className="panel">
        <div className="panel-header">
          <h2>Plan your next focused session</h2>
          <p>Choose the repo, set the outcome, and move into work with a clear plan.</p>
        </div>

        {prefillMessage && (
          <InlineMessage tone="success" title="Draft ready">
            <p>{prefillMessage}</p>
          </InlineMessage>
        )}

        {systemHealthError && (
          <InlineMessage tone="error" title="Preflight unavailable">
            <p>{systemHealthError}</p>
          </InlineMessage>
        )}

        {systemHealth && systemHealth.warnings.length > 0 && (
          <InlineMessage
            tone={hasBlockingSystemIssue ? "error" : "info"}
            title="System checks"
          >
            <ul className="message-list">
              {systemHealth.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </InlineMessage>
        )}

        {workspaceLoadError && (
          <InlineMessage tone="error" title="Workspace list unavailable">
            <p>{workspaceLoadError}</p>
          </InlineMessage>
        )}

        {errorMessage && (
          <InlineMessage tone="error" title="Start session blocked">
            <p>{errorMessage}</p>
          </InlineMessage>
        )}

        <div className="form-group">
          <div className="form-label-row">
            <label className="form-label" htmlFor="session-workspace">
              Workspace
            </label>
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
            id="session-workspace"
            className="form-select"
            value={selectedWorkspaceId}
            onChange={(e) => onSelectWorkspace(e.target.value)}
            aria-describedby="session-workspace-hint"
          >
            <option value="">Select a workspace...</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
                {ws.localPath
                  ? ` (${ws.localPath})`
                  : ws.githubRepo
                    ? ` (${ws.githubRepo})`
                    : ""}
              </option>
            ))}
          </select>
          <p id="session-workspace-hint" className="form-hint">
            Choose the repo SessionPilot should scan before planning your work.
          </p>
          {workspaces.length === 0 && (
            <InlineMessage tone="info" title="No workspaces yet" className="compact-message">
              <p>Add a workspace first so SessionPilot has a project to plan against.</p>
            </InlineMessage>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="session-goal">
            What are you driving forward?
          </label>
          <textarea
            id="session-goal"
            className="form-textarea"
            placeholder="e.g., Ship auth flow, fix checkout regression, review PRs"
            value={userGoal}
            onChange={(e) => onChangeGoal(e.target.value)}
            aria-describedby="session-goal-hint"
          />
          <p id="session-goal-hint" className="form-hint">
            Be specific about the outcome you want. The planner uses this to shape the task list.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="session-budget">
            Time budget: {timeBudget} minutes
          </label>
          <input
            id="session-budget"
            type="range"
            className="slider"
            min="15"
            max="180"
            step="15"
            value={timeBudget}
            onChange={(e) => onChangeTimeBudget(Number(e.target.value))}
            aria-valuetext={`${timeBudget} minutes`}
          />
        </div>

        <div className="form-group">
          <p className="form-label">Focus balance</p>

          <div className="slider-group">
            <div className="slider-header">
              <label className="slider-label" htmlFor="focus-bugs">
                Bug fixes
              </label>
              <span className="slider-value">
                {Math.round(focusWeights.bugs * 100)}%
              </span>
            </div>
            <input
              id="focus-bugs"
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
              aria-valuetext={`${Math.round(focusWeights.bugs * 100)} percent bug fixes`}
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <label className="slider-label" htmlFor="focus-features">
                New features
              </label>
              <span className="slider-value">
                {Math.round(focusWeights.features * 100)}%
              </span>
            </div>
            <input
              id="focus-features"
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
              aria-valuetext={`${Math.round(focusWeights.features * 100)} percent new features`}
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <label className="slider-label" htmlFor="focus-refactor">
                Refactoring
              </label>
              <span className="slider-value">
                {Math.round(focusWeights.refactor * 100)}%
              </span>
            </div>
            <input
              id="focus-refactor"
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
              aria-valuetext={`${Math.round(focusWeights.refactor * 100)} percent refactoring`}
            />
          </div>
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={onStart}
          disabled={!canStart || isLoading}
        >
          {isLoading ? "Starting..." : "Create session plan"}
        </button>
      </section>

      <SessionHistoryPanel
        selectedWorkspaceId={selectedWorkspaceId}
        workspacesCount={workspaces.length}
        sessions={sessionHistory}
        isLoading={isLoadingSessionHistory}
        errorMessage={sessionHistoryError}
        onResumeSession={onResumeSession || (() => {})}
        onReviewSession={onReviewSession || (() => {})}
        onManageWorkspaces={onManageWorkspaces}
      />
    </div>
  );
}
