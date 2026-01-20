/**
 * Domain types for SessionPilot
 *
 * These types represent the core business entities and API contracts.
 * Database types are defined in server/db/schema.ts
 */

// =============================================================================
// Focus Weights - sliders for prioritizing different work types
// =============================================================================

export interface FocusWeights {
  bugs: number; // 0.0-1.0, weight for bug fixes
  features: number; // 0.0-1.0, weight for new features
  refactor: number; // 0.0-1.0, weight for refactoring/cleanup
}

// =============================================================================
// Session State Machine
// =============================================================================

export type SessionState = "start" | "planning" | "session" | "summary";

export type SessionStatus = "planning" | "active" | "completed" | "cancelled";

export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface CreateWorkspaceRequest {
  name: string;
  localPath: string;
  githubRepo?: string;
}

export interface StartSessionRequest {
  workspaceId: string;
  userGoal: string;
  timeBudgetMinutes: number;
  focusWeights: FocusWeights;
}

export interface StartSessionResponse {
  sessionId: string;
  status: SessionStatus;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  estimatedMinutes?: number;
}

export interface UpdateTaskRequest {
  status: TaskStatus;
  notes?: string;
}

export interface EndSessionRequest {
  summary?: string; // Optional user-provided summary override
}

export interface EndSessionResponse {
  sessionId: string;
  summary: string;
  tasksCompleted: number;
  tasksTotal: number;
}

// =============================================================================
// SSE Event Types
// =============================================================================

export type SSEEventType =
  | "scan_started"
  | "scan_progress"
  | "scan_completed"
  | "planning_started"
  | "task_generated"
  | "planning_completed"
  | "session_started"
  | "task_updated"
  | "session_ended"
  | "error";

export interface SSEEvent {
  type: SSEEventType;
  timestamp: string;
  data: unknown;
}

export interface ScanProgressEvent extends SSEEvent {
  type: "scan_progress";
  data: {
    source: "local" | "github";
    message: string;
    progress: number; // 0.0-1.0
  };
}

export interface TaskGeneratedEvent extends SSEEvent {
  type: "task_generated";
  data: {
    taskId: string;
    title: string;
    description?: string;
    estimatedMinutes?: number;
  };
}

export interface ErrorEvent extends SSEEvent {
  type: "error";
  data: {
    code: string;
    message: string;
  };
}

// =============================================================================
// Signal Types (from scanners)
// =============================================================================

export type SignalSource = "local" | "github";

export type SignalType =
  | "todo_comment" // TODO/FIXME in code
  | "open_issue" // GitHub issue
  | "open_pr" // GitHub PR awaiting review
  | "recent_commit" // Recent commit that might need follow-up
  | "failing_test" // Test that's currently failing
  | "lint_error" // Linting issues
  | "type_error" // TypeScript errors
  | "stale_branch" // Branch that hasn't been updated
  | "merge_conflict" // Unresolved merge conflict
  | "custom"; // User-defined signal type

export interface ScanSignal {
  id: string;
  source: SignalSource;
  signalType: SignalType;
  title: string;
  description?: string;
  filePath?: string;
  url?: string;
  lineNumber?: number;
  priority: number; // 0.0-1.0 computed relevance
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Planning Types
// =============================================================================

export interface PlannedTask {
  title: string;
  description?: string;
  estimatedMinutes: number;
  relatedSignals: string[]; // Signal IDs that informed this task
  order: number;
}

export interface SessionPlan {
  sessionId: string;
  tasks: PlannedTask[];
  totalEstimatedMinutes: number;
  reasoning?: string; // Why these tasks were selected
}

// =============================================================================
// UI State Types
// =============================================================================

export interface UIWorkspace {
  id: string;
  name: string;
  localPath: string;
  githubRepo?: string;
}

export interface UITask {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  status: TaskStatus;
  notes?: string;
}

export interface UISession {
  id: string;
  workspaceId: string;
  userGoal: string;
  timeBudgetMinutes: number;
  focusWeights: FocusWeights;
  status: SessionStatus;
  tasks: UITask[];
  summary?: string;
}
