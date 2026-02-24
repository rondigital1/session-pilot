import { eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import { signals, type Signal, type NewSignal } from "../schema";

export async function storeSignals(signalData: NewSignal[]): Promise<Signal[]> {
  if (signalData.length === 0) return [];
  await ensureInitialized();
  const db = getDb();
  await db.insert(signals).values(signalData);
  return db
    .select()
    .from(signals)
    .where(inArray(signals.id, signalData.map((s) => s.id)));
}

export async function getSessionSignals(sessionId: string): Promise<Signal[]> {
  await ensureInitialized();
  const db = getDb();
  return db.select().from(signals).where(eq(signals.sessionId, sessionId));
}

export async function getHighPrioritySignals(
  sessionId: string,
  _minPriority: number = 0.7
): Promise<Signal[]> {
  // TODO(SessionPilot): Add priority filtering
  // WHERE priority >= minPriority ORDER BY priority DESC
  return getSessionSignals(sessionId);
}
