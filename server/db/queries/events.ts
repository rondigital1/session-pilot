import { eq, gt, and } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import {
  sessionEvents,
  type SessionEvent,
  type NewSessionEvent,
} from "../schema";

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

export async function getSessionEventsAfter(
  sessionId: string,
  afterId: number = 0
): Promise<SessionEvent[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        gt(sessionEvents.id, afterId)
      )
    )
    .orderBy(sessionEvents.id);
}

export async function getAllSessionEvents(
  sessionId: string
): Promise<SessionEvent[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(sessionEvents.id);
}

export async function deleteSessionEvents(sessionId: string): Promise<void> {
  await ensureInitialized();
  const db = getDb();
  await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
}
