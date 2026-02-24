import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import {
  workspaces,
  sessions,
  sessionTasks,
  signals,
  sessionSummaries,
  sessionEvents,
  type Workspace,
  type NewWorkspace,
} from "../schema";

export async function listWorkspaces(): Promise<Workspace[]> {
  await ensureInitialized();
  const db = getDb();
  return db.select().from(workspaces);
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(workspaces).where(eq(workspaces.id, id));
  return result[0];
}

export async function createWorkspace(data: NewWorkspace): Promise<Workspace> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(workspaces).values(data);
  const created = await db.select().from(workspaces).where(eq(workspaces.id, data.id));
  if (!created[0]) throw new Error("Failed to create workspace");
  return created[0];
}

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

export async function deleteWorkspace(id: string): Promise<boolean> {
  await ensureInitialized();
  const db = getDb();

  const workspaceSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.workspaceId, id));

  const sessionIds = workspaceSessions.map((s) => s.id);

  for (const sessionId of sessionIds) {
    await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
    await db.delete(sessionTasks).where(eq(sessionTasks.sessionId, sessionId));
    await db.delete(signals).where(eq(signals.sessionId, sessionId));
    await db.delete(sessionSummaries).where(eq(sessionSummaries.sessionId, sessionId));
  }

  await db.delete(sessions).where(eq(sessions.workspaceId, id));
  const result = await db.delete(workspaces).where(eq(workspaces.id, id));
  return (result.rowsAffected ?? 0) > 0;
}
