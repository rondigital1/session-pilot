import { eq, desc } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import {
  sessions,
  sessionSummaries,
  type Session,
  type NewSession,
  type SessionSummary,
  type NewSessionSummary,
} from "../schema";

export async function createSession(data: NewSession): Promise<Session> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(sessions).values(data);
  const created = await db.select().from(sessions).where(eq(sessions.id, data.id));
  if (!created[0]) throw new Error("Failed to create session");
  return created[0];
}

export async function getSession(id: string): Promise<Session | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(sessions).where(eq(sessions.id, id));
  return result[0];
}

export async function listSessionsForWorkspace(workspaceId: string): Promise<Session[]> {
  await ensureInitialized();
  const db = getDb();
  return db.select().from(sessions).where(eq(sessions.workspaceId, workspaceId));
}

export async function updateSessionStatus(
  id: string,
  status: Session["status"]
): Promise<Session | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db.update(sessions).set({ status }).where(eq(sessions.id, id));
  return getSession(id);
}

export async function endSession(
  id: string,
  summary: string
): Promise<Session | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db
    .update(sessions)
    .set({ status: "completed", summary, endedAt: new Date() })
    .where(eq(sessions.id, id));
  return getSession(id);
}

export async function getLastSessionSummary(
  workspaceId: string
): Promise<string | null> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select({ summary: sessionSummaries.summary })
    .from(sessionSummaries)
    .where(eq(sessionSummaries.workspaceId, workspaceId))
    .orderBy(desc(sessionSummaries.createdAt))
    .limit(1);
  return result[0]?.summary ?? null;
}

export async function storeSessionSummary(
  data: NewSessionSummary
): Promise<SessionSummary> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(sessionSummaries).values(data);
  const created = await db
    .select()
    .from(sessionSummaries)
    .where(eq(sessionSummaries.id, data.id));
  if (!created[0]) throw new Error("Failed to store session summary");
  return created[0];
}
