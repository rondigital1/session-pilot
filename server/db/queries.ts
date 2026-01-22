import { eq, desc, gt, and } from "drizzle-orm";
import { getDb, initializeDb } from "./client";
import {
  workspaces,
  sessions,
  sessionTasks,
  signals,
  sessionEvents,
  type Workspace,
  type NewWorkspace,
  type Session,
  type NewSession,
  type SessionTask,
  type NewSessionTask,
  type Signal,
  type NewSignal,
  type SessionEvent,
  type NewSessionEvent,
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
 */
export async function updateWorkspace(
  id: string,
  data: Partial<Omit<NewWorkspace, "id" | "createdAt">>
): Promise<Workspace | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db
    .update(workspaces)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workspaces.id, id));
  return getWorkspace(id);
}

/**
 * Delete a workspace and all associated data (cascade delete)
 *
 * This deletes in order to respect foreign key constraints:
 * 1. Session events (references sessions)
 * 2. Session tasks (references sessions)
 * 3. Signals (references sessions)
 * 4. Sessions (references workspace)
 * 5. Workspace
 */
export async function deleteWorkspace(id: string): Promise<boolean> {
  await ensureInitialized();
  const db = getDb();

  // Get all sessions for this workspace
  const workspaceSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.workspaceId, id));

  const sessionIds = workspaceSessions.map((s) => s.id);

  // Delete related data for each session
  for (const sessionId of sessionIds) {
    // Delete session events
    await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
    // Delete session tasks
    await db.delete(sessionTasks).where(eq(sessionTasks.sessionId, sessionId));
    // Delete signals
    await db.delete(signals).where(eq(signals.sessionId, sessionId));
  }

  // Delete all sessions for this workspace
  await db.delete(sessions).where(eq(sessions.workspaceId, id));

  // Finally delete the workspace
  const result = await db.delete(workspaces).where(eq(workspaces.id, id));
  return (result.rowsAffected ?? 0) > 0;
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
 * Returns the summary from the last completed session for the given workspace.
 * Used to provide context for the next session planning.
 */
export async function getLastSessionSummary(
  workspaceId: string
): Promise<string | null> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select({ summary: sessions.summary })
    .from(sessions)
    .where(eq(sessions.workspaceId, workspaceId))
    .orderBy(desc(sessions.endedAt))
    .limit(1);

  return result[0]?.summary ?? null;
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
 * Get a single task by ID
 * 
 * Used for IDOR protection - to verify task ownership before updates
 */
export async function getTask(taskId: string): Promise<SessionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.id, taskId));
  return result[0];
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  taskId: string,
  status: SessionTask["status"],
  notes?: string,
  checklist?: string | null,
  context?: string | null
): Promise<SessionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  const updates: Partial<SessionTask> = { status };

  if (notes !== undefined) {
    updates.notes = notes;
  }

  if (checklist !== undefined) {
    updates.checklist = checklist;
  }

  if (context !== undefined) {
    updates.context = context;
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

// =============================================================================
// Session Event Queries
// =============================================================================

/**
 * Store a session event
 */
export async function storeSessionEvent(
  sessionId: string,
  eventType: string,
  eventData: unknown
): Promise<SessionEvent> {
  await ensureInitialized();
  const db = getDb();

  const data: NewSessionEvent = {
    sessionId,
    eventType,
    eventData: JSON.stringify(eventData),
    createdAt: new Date(),
  };

  const result = await db.insert(sessionEvents).values(data).returning();
  return result[0];
}

/**
 * Get session events after a given ID (for polling)
 */
export async function getSessionEventsAfter(
  sessionId: string,
  afterId: number = 0
): Promise<SessionEvent[]> {
  await ensureInitialized();
  const db = getDb();

  const result = await db
    .select()
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        gt(sessionEvents.id, afterId)
      )
    )
    .orderBy(sessionEvents.id);

  return result;
}

/**
 * Get all session events
 */
export async function getAllSessionEvents(
  sessionId: string
): Promise<SessionEvent[]> {
  await ensureInitialized();
  const db = getDb();

  const result = await db
    .select()
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(sessionEvents.id);

  return result;
}

/**
 * Delete session events (for cleanup)
 */
export async function deleteSessionEvents(sessionId: string): Promise<void> {
  await ensureInitialized();
  const db = getDb();
  await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
}
