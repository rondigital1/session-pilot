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

export type SessionState = "start" | "planning" | "task_selection" | "session" | "summary";

export type SessionStatus = "planning" | "active" | "completed" | "cancelled";

export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface CreateWorkspaceRequest {
  name: string;
  localPath?: string;
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
  checklist?: UITaskChecklistItem[];
  context?: UITaskContext;
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  title?: string;
  description?: string | null;
  estimatedMinutes?: number | null;
  notes?: string;
  checklist?: UITaskChecklistItem[];
  context?: UITaskContext;
}

export interface GenerateChecklistRequest {
  title?: string;
  description: string;
}

export interface SessionMetrics {
  tasksCompleted: number;
  tasksTotal: number;
  tasksPending: number;
  tasksSkipped: number;
  completionRate: number;
  totalEstimatedMinutes: number;
  actualDurationMinutes: number;
}

export interface EndSessionRequest {
  summary?: string; // Optional user-provided summary override
}

export interface EndSessionResponse {
  sessionId: string;
  summary: string;
  tasksCompleted: number;
  tasksTotal: number;
  metrics: SessionMetrics;
}

export interface CancelSessionResponse {
  sessionId: string;
  cancelled: boolean;
}

export interface UISessionHistoryItem {
  id: string;
  workspaceId: string;
  userGoal: string;
  timeBudgetMinutes: number;
  focusWeights: FocusWeights;
  status: SessionStatus;
  summary?: string | null;
  metrics?: SessionMetrics | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface SystemHealthCheck {
  status: "ok" | "warning" | "error";
  message: string;
  workspaceCount?: number;
}

export interface SystemHealthReport {
  status: "ok" | "degraded";
  timestamp: string;
  warnings: string[];
  checks: {
    appUrl: SystemHealthCheck;
    anthropic: SystemHealthCheck;
    github: SystemHealthCheck;
    workspaceRoots: SystemHealthCheck;
    database: SystemHealthCheck;
  };
}

// =============================================================================
// SSE Event Types
// =============================================================================

export type SSEEventType =
  | "connected"
  | "heartbeat"
  | "scan_started"
  | "scan_progress"
  | "scan_completed"
  | "planning_started"
  | "task_generated"
  | "planning_completed"
  | "session_started"
  | "task_updated"
  | "session_ended"
  | "session_timeout"
  | "timer_warning"
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

export interface SessionTimeoutEvent extends SSEEvent {
  type: "session_timeout";
  data: {
    sessionId: string;
    elapsedMinutes: number;
    budgetMinutes: number;
  };
}

export interface TimerWarningEvent extends SSEEvent {
  type: "timer_warning";
  data: {
    sessionId: string;
    remainingMinutes: number;
    warningType: "ten_minute" | "five_minute";
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
  | "pr_review_comment" // PR review comment needing action
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
  localPath?: string | null;
  githubRepo?: string | null;
}

export interface UITaskChecklistItem {
  id: string;
  title: string;
  done?: boolean;
}

export interface UITaskContextLink {
  label: string;
  url: string;
}

export interface UITaskContext {
  files?: string[];
  relatedIssues?: string[];
  links?: UITaskContextLink[];
}

export interface UITask {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  status: TaskStatus;
  notes?: string;
  checklist?: UITaskChecklistItem[];
  context?: UITaskContext;
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
  metrics?: SessionMetrics;
  startedAt: string;
  endedAt?: string | null;
}

// =============================================================================
// Repo Improvement Orchestrator Types
// =============================================================================

export type SuggestionCategory =
  | "frontend"
  | "backend"
  | "architecture"
  | "testing"
  | "dx"
  | "performance"
  | "security"
  | "observability"
  | "docs"
  | "workflow";

export type FindingSeverity = "info" | "warning" | "critical";

export type AutonomyMode = "safe_auto" | "guided" | "manual_review";

export type AnalysisRunStatus = "running" | "completed" | "failed";

export type ExecutionProviderId = "codex-cli";

export type ExecutionStatus =
  | "queued"
  | "preparing"
  | "running"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

export type ExecutionEventType =
  | "status"
  | "log"
  | "stdout"
  | "stderr"
  | "agent_event"
  | "validation_started"
  | "validation_result"
  | "completed"
  | "failed"
  | "cancelled";

export interface CreateRepoRootRequest {
  label: string;
  path: string;
}

export interface UpdateRepoRootRequest {
  label?: string;
  path?: string;
}

export interface RepoRootRecord {
  id: string;
  label: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryInventoryItem {
  id: string;
  rootId: string;
  name: string;
  path: string;
  remoteOrigin?: string | null;
  defaultBranch?: string | null;
  currentBranch?: string | null;
  isDirty: boolean;
  lastAnalyzedAt?: string | null;
  lastAnalysisRunId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepoProfile {
  repositoryId: string;
  repoName: string;
  repoPath: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  languages: string[];
  frameworks: string[];
  scripts: string[];
  stackTags: string[];
  validationCommands: string[][];
  defaultBranch?: string | null;
  currentBranch?: string | null;
  remoteOrigin?: string | null;
  isDirty: boolean;
  hasReadme: boolean;
  hasEnvExample: boolean;
  hasCi: boolean;
  hasLint: boolean;
  hasTests: boolean;
  hasTypecheck: boolean;
  typecheckStrict: boolean;
  ciProvider?: string | null;
  testRunner?: string | null;
  lintTool?: string | null;
  lineCount: number;
  fileCount: number;
}

export interface RepoFindingEvidence {
  label: string;
  detail: string;
  filePath?: string;
}

export interface RepoFinding {
  id: string;
  category: SuggestionCategory;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence: RepoFindingEvidence[];
  likelyFiles: string[];
}

export interface RepoAnalysisResult {
  id: string;
  repositoryId: string;
  status: AnalysisRunStatus;
  profile: RepoProfile;
  findings: RepoFinding[];
  summary: string;
  createdAt: string;
  completedAt?: string | null;
  error?: string | null;
}

export interface SuggestionEvidenceItem {
  label: string;
  detail: string;
  filePath?: string;
}

export interface SuggestionRecord {
  id: string;
  repositoryId: string;
  analysisRunId: string;
  title: string;
  category: SuggestionCategory;
  summary: string;
  evidence: SuggestionEvidenceItem[];
  impactScore: number;
  effortScore: number;
  confidenceScore: number;
  riskScore: number;
  priorityScore: number;
  autonomyMode: AutonomyMode;
  likelyFiles: string[];
  createdAt: string;
}

export interface TaskSpec {
  suggestionId: string;
  repositoryId: string;
  title: string;
  problem: string;
  evidence: string[];
  goal: string;
  nonGoals: string[];
  likelyFiles: string[];
  implementationPlan: string[];
  acceptanceCriteria: string[];
  validationCommands: string[][];
  risks: string[];
}

export interface PromptGenerationResult {
  providerId: ExecutionProviderId;
  prompt: string;
}

export interface CreateExecutionRequest {
  suggestionId: string;
  providerId: ExecutionProviderId;
}

export interface ValidationCommandResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecutionTaskRecord {
  id: string;
  repositoryId: string;
  suggestionId: string;
  providerId: ExecutionProviderId;
  status: ExecutionStatus;
  branchName?: string | null;
  worktreePath?: string | null;
  taskSpec: TaskSpec;
  agentPrompt: string;
  validationCommands: string[][];
  validationResults: ValidationCommandResult[];
  finalMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  error?: string | null;
}

export interface ExecutionEventRecord {
  id: number;
  executionTaskId: string;
  type: ExecutionEventType;
  timestamp: string;
  data: unknown;
}

export interface RepositoryListResponse {
  repositories: RepositoryInventoryItem[];
}

export interface RepositoryDetailResponse {
  repository: RepositoryInventoryItem;
  analysis: RepoAnalysisResult | null;
  suggestions: SuggestionRecord[];
  executions: ExecutionTaskRecord[];
}

export interface AnalyzeRepositoryResponse {
  repository: RepositoryInventoryItem;
  analysis: RepoAnalysisResult;
  suggestions: SuggestionRecord[];
}

export interface SuggestionDetailResponse {
  suggestion: SuggestionRecord;
  repository: RepositoryInventoryItem;
  analysis: RepoAnalysisResult | null;
}

export interface SuggestionTaskResponse extends SuggestionDetailResponse {
  taskSpec: TaskSpec;
  prompt: PromptGenerationResult;
}

export interface CreateExecutionResponse {
  execution: ExecutionTaskRecord;
}

export interface ExecutionDetailResponse {
  execution: ExecutionTaskRecord;
  repository: RepositoryInventoryItem | null;
  suggestion: SuggestionRecord | null;
}

export interface CancelExecutionResponse {
  cancelled: boolean;
}
