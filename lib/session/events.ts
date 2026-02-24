/**
 * Session Event Emitter
 *
 * Database-backed event system for communicating between the planning workflow
 * and SSE endpoints. Events are stored in the database for reliability.
 */

import type { SSEEvent, SSEEventType } from "@/server/types/domain";
import { storeSessionEvent, getSessionEventsAfter } from "@/server/db/queries";
import type { SessionEvent } from "@/server/db/schema";

/**
 * Emit an event for a session
 *
 * Stores the event in the database. The SSE endpoint polls for new events.
 */
export async function emitSessionEvent(
  sessionId: string,
  type: SSEEventType,
  data: unknown
): Promise<void> {
  const eventData = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    await storeSessionEvent(sessionId, type, eventData);
  } catch (error) {
    console.error(`[SessionEvents] Failed to store event:`, error);
  }
}

/**
 * Mark a session's event stream as complete
 *
 * Emits a special "stream_complete" event to signal the SSE endpoint.
 */
export async function completeSession(sessionId: string): Promise<void> {
  await emitSessionEvent(sessionId, "session_ended", {
    sessionId,
    message: "Session event stream complete",
    streamComplete: true,
  });
}

/**
 * Poll for new events after a given event ID
 *
 * Used by SSE endpoint to get new events since last poll.
 */
export async function pollSessionEvents(
  sessionId: string,
  afterId: number = 0
): Promise<{ events: SSEEvent[]; lastId: number; isComplete: boolean }> {
  try {
    const dbEvents = await getSessionEventsAfter(sessionId, afterId);

    const events: SSEEvent[] = dbEvents.map((e: SessionEvent) => {
      const parsed = JSON.parse(e.eventData);
      return {
        type: e.eventType as SSEEventType,
        timestamp: parsed.timestamp || e.createdAt.toISOString(),
        data: parsed.data,
      };
    });

    const lastId = dbEvents.length > 0 ? dbEvents[dbEvents.length - 1].id : afterId;

    // Check if stream is complete by looking for session_ended event
    const isComplete = dbEvents.some(
      (e) => e.eventType === "session_ended"
    );

    return { events, lastId, isComplete };
  } catch (error) {
    console.error(`[SessionEvents] Failed to poll events:`, error);
    return { events: [], lastId: afterId, isComplete: false };
  }
}

/**
 * Check if a session's event stream is complete
 */
export async function isSessionComplete(sessionId: string): Promise<boolean> {
  try {
    const { isComplete } = await pollSessionEvents(sessionId, 0);
    return isComplete;
  } catch {
    return false;
  }
}

export function cleanupSession(): void {
  // No-op - events are stored in database
}
