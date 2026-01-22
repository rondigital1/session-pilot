import { NextRequest } from "next/server";
import { getSession } from "@/server/db/queries";
import { pollSessionEvents } from "@/lib/session/events";
import { safeClose } from "@/lib/sse";

// Force Node.js runtime
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 1000; // Poll every second
const HEARTBEAT_INTERVAL_MS = 15000; // Send heartbeat every 15 seconds
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes max

/**
 * GET /api/session/[id]/events
 * Server-Sent Events endpoint for session updates
 *
 * Connect to this endpoint after starting a session to receive
 * real-time updates about scanning progress, task generation, etc.
 *
 * Event types:
 * - connected: Initial connection established
 * - scan_started: Scanning has begun
 * - scan_progress: Progress update from scanner
 * - scan_completed: Scanning finished
 * - planning_started: AI planning has begun
 * - task_generated: A new task was generated
 * - planning_completed: All tasks generated, ready for session
 * - session_started: Session is now active
 * - task_updated: A task status changed
 * - session_ended: Session was completed or cancelled
 * - error: An error occurred
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  // Validate session exists
  let session;
  try {
    session = await getSession(sessionId);
  } catch (error) {
    console.error("[SSE Events] Database error fetching session:", error);
    return new Response(
      JSON.stringify({ error: "Database error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  
  if (!session) {
    console.error("[SSE Events] Session not found:", sessionId);
    return new Response(
      JSON.stringify({ error: "Session not found", sessionId }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  let lastEventId = 0;
  let isStreamClosed = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  console.log(`[SSE Events] Client connecting to session ${sessionId}`);

  // Create SSE stream with polling
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      console.log(`[SSE Events] Sending connected event for ${sessionId}`);
      const connectedEvent = `data: ${JSON.stringify({
        type: "connected",
        timestamp: new Date().toISOString(),
        data: { sessionId, message: "Connected to session events" },
      })}\n\n`;
      controller.enqueue(encoder.encode(connectedEvent));

      // Start polling for events
      async function pollForEvents() {
        if (isStreamClosed) return;

        try {
          const { events, lastId, isComplete } = await pollSessionEvents(
            sessionId,
            lastEventId
          );

          if (events.length > 0) {
            console.log(`[SSE Events] Sending ${events.length} events for ${sessionId}, isComplete: ${isComplete}`);
          }

          // Send any new events
          for (const event of events) {
            if (isStreamClosed) break;
            const eventData = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(eventData));
          }

          lastEventId = lastId;

          // Close stream if session is complete
          if (isComplete) {
            console.log(`[SSE Events] Session complete, closing stream for ${sessionId}`);
            cleanup();
            safeClose(controller);
            return;
          }
        } catch (error) {
          console.error("[SSE] Poll error:", error);
          // Send error event
          try {
            const errorEvent = `data: ${JSON.stringify({
              type: "error",
              timestamp: new Date().toISOString(),
              data: { code: "POLL_ERROR", message: "Failed to fetch events" },
            })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          } catch {
            // Stream closed
            cleanup();
          }
        }
      }

      function cleanup() {
        isStreamClosed = true;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
      
      // Send a heartbeat to keep the connection alive
      function sendHeartbeat() {
        if (isStreamClosed) return;
        try {
          const heartbeatEvent = `data: ${JSON.stringify({
            type: "heartbeat",
            timestamp: new Date().toISOString(),
            data: {},
          })}\n\n`;
          controller.enqueue(encoder.encode(heartbeatEvent));
        } catch {
          // Stream closed, clean up
          cleanup();
        }
      }

      // Initial poll
      pollForEvents();

      // Set up polling interval
      pollInterval = setInterval(pollForEvents, POLL_INTERVAL_MS);
      
      // Set up heartbeat interval to keep connection alive
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

      // Set up max duration timeout
      timeoutId = setTimeout(() => {
        try {
          const timeoutEvent = `data: ${JSON.stringify({
            type: "session_timeout",
            timestamp: new Date().toISOString(),
            data: { sessionId, message: "SSE connection timed out" },
          })}\n\n`;
          controller.enqueue(encoder.encode(timeoutEvent));
        } catch {
          // Ignore
        }
        cleanup();
        safeClose(controller);
      }, MAX_POLL_DURATION_MS);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        cleanup();
        safeClose(controller);
      });
    },

    cancel() {
      isStreamClosed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (timeoutId) clearTimeout(timeoutId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
