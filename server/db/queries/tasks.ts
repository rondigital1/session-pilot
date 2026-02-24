import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import {
  sessionTasks,
  type SessionTask,
  type NewSessionTask,
} from "../schema";

export async function createSessionTask(data: NewSessionTask): Promise<SessionTask> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(sessionTasks).values(data);
  const created = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.id, data.id));
  if (!created[0]) throw new Error("Failed to create session task");
  return created[0];
}

export async function listSessionTasks(sessionId: string): Promise<SessionTask[]> {
  await ensureInitialized();
  const db = getDb();
  return db.select().from(sessionTasks).where(eq(sessionTasks.sessionId, sessionId));
}

export async function getTask(taskId: string): Promise<SessionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.id, taskId));
  return result[0];
}

export interface UpdateSessionTaskInput {
  status?: SessionTask["status"];
  title?: string;
  description?: string | null;
  estimatedMinutes?: number | null;
  notes?: string | null;
  checklist?: string | null;
  context?: string | null;
}

export async function updateSessionTask(
  taskId: string,
  data: UpdateSessionTaskInput
): Promise<SessionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  const updates: Partial<SessionTask> = {};

  if (data.status !== undefined) {
    updates.status = data.status;
    updates.completedAt = data.status === "completed" ? new Date() : null;
  }
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.estimatedMinutes !== undefined) updates.estimatedMinutes = data.estimatedMinutes;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.checklist !== undefined) updates.checklist = data.checklist;
  if (data.context !== undefined) updates.context = data.context;

  if (Object.keys(updates).length === 0) return getTask(taskId);

  await db.update(sessionTasks).set(updates).where(eq(sessionTasks.id, taskId));
  const updated = await db
    .select()
    .from(sessionTasks)
    .where(eq(sessionTasks.id, taskId));
  return updated[0];
}

export async function createSessionTasksBulk(
  tasks: NewSessionTask[]
): Promise<SessionTask[]> {
  if (tasks.length === 0) return [];
  await ensureInitialized();
  const db = getDb();
  await db.insert(sessionTasks).values(tasks);
  return db
    .select()
    .from(sessionTasks)
    .where(inArray(sessionTasks.id, tasks.map((t) => t.id)));
}
