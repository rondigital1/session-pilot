import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Workspaces table - stores user-defined workspace configurations
 * Each workspace represents a local repo path with optional GitHub connection
 */
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  localPath: text("local_path").notNull(),
  githubRepo: text("github_repo"), // Optional: "owner/repo" format
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Sessions table - stores coding session metadata
 * A session belongs to a workspace and tracks time budget + focus weights
 */
export const sessions = sqliteTable("sessions", {
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
});

/**
 * Session tasks table - individual tasks within a session
 * Tasks are created from the planned work items
 */
export const sessionTasks = sqliteTable("session_tasks", {
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
  order: integer("order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

/**
 * Signals table - stores scan results from local/GitHub scanners
 * Signals are inputs to the planning algorithm
 */
export const signals = sqliteTable("signals", {
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
});

// Type exports for use in application code
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type SessionTask = typeof sessionTasks.$inferSelect;
export type NewSessionTask = typeof sessionTasks.$inferInsert;

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
