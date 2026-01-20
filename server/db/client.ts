import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Database singleton
let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: ReturnType<typeof createClient> | null = null;

/**
 * Get or create the database connection
 * Uses DB_PATH env var or defaults to ./session-pilot.db
 */
export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.DB_PATH || "./session-pilot.db";
  clientInstance = createClient({
    url: `file:${dbPath}`,
  });

  dbInstance = drizzle(clientInstance, { schema });

  return dbInstance;
}

/**
 * Get the raw libsql client for executing raw SQL
 */
export function getRawClient() {
  if (!clientInstance) {
    getDb(); // Initialize if not already done
  }
  return clientInstance!;
}

/**
 * Initialize database schema
 * Creates tables if they don't exist
 *
 * TODO(SessionPilot): Consider using drizzle-kit migrations for production.
 * This inline schema creation is for development convenience only.
 */
export async function initializeDb() {
  const client = getRawClient();

  // Create tables using raw SQL for initial setup
  // In production, use drizzle-kit generate + migrate
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL,
      github_repo TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      user_goal TEXT NOT NULL,
      time_budget_minutes INTEGER NOT NULL,
      focus_bugs REAL NOT NULL DEFAULT 0.5,
      focus_features REAL NOT NULL DEFAULT 0.5,
      focus_refactor REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'planning',
      summary TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      title TEXT NOT NULL,
      description TEXT,
      estimated_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      source TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      url TEXT,
      priority REAL NOT NULL DEFAULT 0.5,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON session_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_signals_session ON signals(session_id);
  `);

  return getDb();
}

/**
 * Close database connection
 * Call this during graceful shutdown
 */
export function closeDb() {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
    dbInstance = null;
  }
}
