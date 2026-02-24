import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * Workspaces table - stores user-defined workspace configurations
 * Each workspace represents a local repo path and/or GitHub connection
 * At least one of localPath or githubRepo must be provided
 */
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  localPath: text("local_path"), // Optional: local filesystem path
  githubRepo: text("github_repo"), // Optional: "owner/repo" format
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Sessions table - stores coding session metadata
 * A session belongs to a workspace and tracks time budget + focus weights
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userGoal: text("user_goal").notNull(), // "What I'm working on" input
    timeBudgetMinutes: integer("time_budget_minutes").notNull(),
    focusBugs: real("focus_bugs").notNull().default(0.5), // 0.0-1.0 slider weight
    focusFeatures: real("focus_features").notNull().default(0.5),
    focusRefactor: real("focus_refactor").notNull().default(0.5),
    status: text("status", {
      enum: ["planning", "active", "completed", "cancelled"],
    })
      .notNull()
      .default("planning"),
    summary: text("summary"), // Generated at session end
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp" }),
  },
  (table) => [index("idx_sessions_workspace").on(table.workspaceId)]
);

/**
 * Session summaries table - snapshot of generated summaries and completion metrics
 * Stored separately from sessions to support analytics/history queries.
 */
export const sessionSummaries = sqliteTable(
  "session_summaries",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    summary: text("summary").notNull(),
    tasksCompleted: integer("tasks_completed").notNull(),
    tasksTotal: integer("tasks_total").notNull(),
    tasksPending: integer("tasks_pending").notNull(),
    tasksSkipped: integer("tasks_skipped").notNull(),
    completionRate: real("completion_rate").notNull(),
    totalEstimatedMinutes: integer("total_estimated_minutes").notNull(),
    actualDurationMinutes: integer("actual_duration_minutes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_session_summaries_session").on(table.sessionId),
    index("idx_session_summaries_workspace").on(table.workspaceId),
    index("idx_session_summaries_created").on(table.createdAt),
  ]
);

/**
 * Session tasks table - individual tasks within a session
 * Tasks are created from the planned work items
 */
export const sessionTasks = sqliteTable(
  "session_tasks",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    title: text("title").notNull(),
    description: text("description"),
    estimatedMinutes: integer("estimated_minutes"),
    status: text("status", {
      enum: ["pending", "in_progress", "completed", "skipped"],
    })
      .notNull()
      .default("pending"),
    notes: text("notes"), // User notes during session
    checklist: text("checklist"), // JSON list of checklist items
    context: text("context"), // JSON task context (files/issues/links)
    order: integer("order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [index("idx_tasks_session").on(table.sessionId)]
);

/**
 * Signals table - stores scan results from local/GitHub scanners
 * Signals are inputs to the planning algorithm
 */
export const signals = sqliteTable(
  "signals",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    source: text("source", { enum: ["local", "github"] }).notNull(),
    signalType: text("signal_type").notNull(), // e.g., "open_issue", "recent_commit", "todo_comment"
    title: text("title").notNull(),
    description: text("description"),
    filePath: text("file_path"), // For local signals
    url: text("url"), // For GitHub signals
    priority: real("priority").notNull().default(0.5), // 0.0-1.0 computed relevance
    metadata: text("metadata"), // JSON blob for extra data
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("idx_signals_session").on(table.sessionId)]
);

/**
 * Session events table - stores SSE events for real-time updates
 * Events are written by the planning workflow and read by SSE endpoints
 */
export const sessionEvents = sqliteTable(
  "session_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    eventType: text("event_type").notNull(),
    eventData: text("event_data").notNull(), // JSON
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("idx_events_session").on(table.sessionId)]
);

// =============================================================================
// Improve Feature Tables
// =============================================================================

/**
 * Project snapshots table - stores deterministic snapshots of workspace state
 * Each snapshot captures health signals, hotspots, and stack info for a workspace.
 * The snapshotHash enables cache reuse when repo state hasn't changed.
 */
export const projectSnapshots = sqliteTable(
  "project_snapshots",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    snapshotHash: text("snapshot_hash").notNull(),
    snapshotData: text("snapshot_data").notNull(), // Full ProjectSnapshotV1 JSON
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_snapshots_workspace").on(table.workspaceId),
    index("idx_snapshots_hash").on(table.snapshotHash),
    index("idx_snapshots_created").on(table.createdAt),
  ]
);

/**
 * Improvement ideas table - stores AI-generated improvement suggestions
 * Each idea is tied to a snapshot and workspace, with scoring and evidence.
 */
export const improvementIdeas = sqliteTable(
  "improvement_ideas",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => projectSnapshots.id),
    title: text("title").notNull(),
    category: text("category").notNull(),
    impact: text("impact").notNull(), // low, medium, high
    effort: text("effort").notNull(), // small, medium, large
    risk: text("risk").notNull(), // low, medium, high
    confidence: real("confidence").notNull(),
    score: real("score").notNull(),
    evidence: text("evidence").notNull(), // JSON array of evidence items
    acceptanceCriteria: text("acceptance_criteria").notNull(), // JSON array
    steps: text("steps").notNull(), // JSON array
    status: text("status", {
      enum: ["active", "accepted", "rejected", "completed"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_ideas_workspace").on(table.workspaceId),
    index("idx_ideas_snapshot").on(table.snapshotId),
    index("idx_ideas_status").on(table.status),
    index("idx_ideas_created").on(table.createdAt),
  ]
);

/**
 * Idea feedback table - stores user votes on improvement ideas
 * Used to downrank rejected ideas and avoid repeating disliked suggestions.
 */
export const ideaFeedback = sqliteTable(
  "idea_feedback",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => improvementIdeas.id),
    vote: text("vote", { enum: ["up", "down"] }).notNull(),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idx_feedback_idea").on(table.ideaId),
    index("idx_feedback_created").on(table.createdAt),
  ]
);

// Type exports for use in application code
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;

export type SessionTask = typeof sessionTasks.$inferSelect;
export type NewSessionTask = typeof sessionTasks.$inferInsert;

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;

export type SessionEvent = typeof sessionEvents.$inferSelect;
export type NewSessionEvent = typeof sessionEvents.$inferInsert;

export type ProjectSnapshot = typeof projectSnapshots.$inferSelect;
export type NewProjectSnapshot = typeof projectSnapshots.$inferInsert;

export type ImprovementIdea = typeof improvementIdeas.$inferSelect;
export type NewImprovementIdea = typeof improvementIdeas.$inferInsert;

export type IdeaFeedbackRow = typeof ideaFeedback.$inferSelect;
export type NewIdeaFeedback = typeof ideaFeedback.$inferInsert;
