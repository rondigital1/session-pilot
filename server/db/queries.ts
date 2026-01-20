import { eq } from "drizzle-orm";
import { getDb, initializeDb } from "./client";
import {
  workspaces,
  sessions,
  sessionTasks,
  signals,
  type Workspace,
  type NewWorkspace,
  type Session,
  type NewSession,
  type SessionTask,
  type NewSessionTask,
  type Signal,
  type NewSignal,
} from "./schema";

// Flag to track initialization
let isInitialized = false;

/**
 * Ensure database is initialized before queries
 */
async function ensureInitialized() {
  if (!isInitialized) {
    await initializeDb();
    isInitialized = true;
  }
}

// =============================================================================
// Workspace Queries
// =============================================================================

/**
 * List all workspaces
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(workspaces);
  return result;
}

/**
 * Get a single workspace by ID
 */
export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(workspaces).where(eq(workspaces.id, id));
  return result[0];
}

/**
 * Create a new workspace
 */
export async function createWorkspace(data: NewWorkspace): Promise<Workspace> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(workspaces).values(data);
  const created = await db.select().from(workspaces).where(eq(workspaces.id, data.id));
  if (!created[0]) {
    throw new Error("Failed to create workspace");
  }
  return created[0];
}

/**
 * Update an existing workspace
 *
 * TODO(SessionPilot): Implement workspace update logic.
 * Should update name, localPath, and/or githubRepo fields.
 * Remember to update the updatedAt timestamp.
 */
export async function updateWorkspace(
  id: string,
  _data: Partial<Omit<NewWorkspace, "id" | "createdAt">>
): Promise<Workspace | undefined> {
  // TODO(SessionPilot): Implement update query using drizzle
  // await db.update(workspaces).set({ ...data, updatedAt: new Date() }).where(eq(workspaces.id, id));
  const existing = await getWorkspace(id);
  return existing;
}

/**
 * Delete a workspace
 *
 * TODO(SessionPilot): Implement workspace deletion.
 * Consider cascading deletes for associated sessions.
 */
export async function deleteWorkspace(_id: string): Promise<boolean> {
  // TODO(SessionPilot): Implement delete query
  // await db.delete(workspaces).where(eq(workspaces.id, id));
  return false;
}

// =============================================================================
// Session Queries
// =============================================================================

/**
 * Create a new session
 */
export async function createSession(data: NewSession): Promise<Session> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(sessions).values(data);
  const created = await db.select().from(sessions).where(eq(sessions.id, data.id));
  if (!created[0]) {
    throw new Error("Failed to create session");
  }
  return created[0];
}

/**
 * Get a session by ID
 */
export async function getSession(id: string): Promise<Session | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(sessions).where(eq(sessions.id, id));
  return result[0];
}

/**
 * List sessions for a workspace
 *
 * TODO(SessionPilot): Add pagination and filtering options.
 * Consider ordering by startedAt descending.
 */
export async function listSessionsForWorkspace(workspaceId: string): Promise<Session[]> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.workspaceId, workspaceId));
  return result;
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  id: string,
  status: Session["status"]
): Promise<Session | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db.update(sessions).set({ status }).where(eq(sessions.id, id));
  return getSession(id);
}

/**
 * End a session with summary
 *
 * TODO(SessionPilot): Implement session summary generation.
 * Should set status to 'completed', endedAt to now, and store the summary.
 */
export async function endSession(
  id: string,
  summary: string
): Promise<Session | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db.update(sessions)
    .set({
      status: "completed",
      summary,
      endedAt: new Date(),
    })
    .where(eq(sessions.id, id));
  return getSession(id);
}

/**
 * Get the most recent session summary for a workspace
 *
 * TODO(SessionPilot): Implement query to fetch the last completed session's summary.
 * This is used to provide context for the next session planning.
 */
export async function getLastSessionSummary(
  _workspaceId: string
): Promise<string | null> {
  // TODO(SessionPilot): Query for most recent completed session
  // SELECT summary FROM sessions
  // WHERE workspace_id = ? AND status = 'completed'
  // ORDER BY ended_at DESC LIMIT 1
  return null;
}

// =============================================================================
// Session Task Queries
// =============================================================================

/**
 * Create a task for a session
 */
export async function createSessionTask(data: NewSessionTask): Promise<SessionTask> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(sessionTasks).values(data);
  const created = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.id, data.id));
  if (!created[0]) {
    throw new Error("Failed to create session task");
  }
  return created[0];
}

/**
 * List tasks for a session
 */
export async function listSessionTasks(sessionId: string): Promise<SessionTask[]> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.sessionId, sessionId));
  return result;
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  taskId: string,
  status: SessionTask["status"],
  notes?: string
): Promise<SessionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  const updates: Partial<SessionTask> = { status };

  if (notes !== undefined) {
    updates.notes = notes;
  }

  if (status === "completed") {
    updates.completedAt = new Date();
  }

  await db.update(sessionTasks).set(updates).where(eq(sessionTasks.id, taskId));

  const updated = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.id, taskId));
  return updated[0];
}

/**
 * Bulk create tasks for a session
 *
 * TODO(SessionPilot): Implement batch insert for efficiency.
 * Used when creating multiple tasks from the planning phase.
 */
export async function createSessionTasksBulk(
  tasks: NewSessionTask[]
): Promise<SessionTask[]> {
  // TODO(SessionPilot): Use await db.insert(sessionTasks).values(tasks)
  // For now, create one at a time
  const created: SessionTask[] = [];
  for (const task of tasks) {
    const t = await createSessionTask(task);
    created.push(t);
  }
  return created;
}

// =============================================================================
// Signal Queries
// =============================================================================

/**
 * Store signals from a scan
 */
export async function storeSignals(signalData: NewSignal[]): Promise<Signal[]> {
  await ensureInitialized();
  const db = getDb();
  const created: Signal[] = [];

  for (const signal of signalData) {
    await db.insert(signals).values(signal);
    const s = await db.select().from(signals).where(eq(signals.id, signal.id));
    if (s[0]) {
      created.push(s[0]);
    }
  }

  return created;
}

/**
 * Get signals for a session
 */
export async function getSessionSignals(sessionId: string): Promise<Signal[]> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(signals)
    .where(eq(signals.sessionId, sessionId));
  return result;
}

/**
 * Get high-priority signals for planning
 *
 * TODO(SessionPilot): Implement filtering and sorting by priority.
 * Should return signals above a threshold, ordered by priority descending.
 * Consider filtering by signal type and source.
 */
export async function getHighPrioritySignals(
  sessionId: string,
  _minPriority: number = 0.7
): Promise<Signal[]> {
  // TODO(SessionPilot): Add priority filtering
  // WHERE priority >= minPriority ORDER BY priority DESC
  return getSessionSignals(sessionId);
}
