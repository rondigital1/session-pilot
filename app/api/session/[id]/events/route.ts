import { NextRequest } from "next/server";
import { getSession } from "@/server/db/queries";
import type { SSEEvent, SSEEventType } from "@/server/types/domain";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * GET /api/session/[id]/events
 * Server-Sent Events endpoint for session updates
 *
 * Connect to this endpoint after starting a session to receive
 * real-time updates about scanning progress, task generation, etc.
 *
 * Event types:
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
  const session = await getSession(sessionId);
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE events
      const sendEvent = (event: SSEEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // Send initial connection event
      sendEvent({
        type: "scan_started",
        timestamp: new Date().toISOString(),
        data: { sessionId, message: "Connected to session events" },
      });

      // TODO(SessionPilot): Replace mock events with real event streaming.
      // This should integrate with the actual planning workflow:
      // 1. Subscribe to scan progress events from localScan/githubScan
      // 2. Subscribe to planning progress from the Claude agent
      // 3. Subscribe to task creation events
      // 4. Keep connection alive with periodic heartbeats
      //
      // Consider using an event emitter or pub/sub pattern to
      // decouple the planning workflow from the SSE endpoint.

      // For now, send mock events to demonstrate the flow
      await sendMockEvents(sendEvent, sessionId, controller);
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

/**
 * Send mock events to demonstrate the SSE flow
 *
 * TODO(SessionPilot): Remove this function and replace with real event streaming
 */
async function sendMockEvents(
  sendEvent: (event: SSEEvent) => void,
  sessionId: string,
  controller: ReadableStreamDefaultController
) {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // Simulate local scan
    await delay(500);
    sendEvent({
      type: "scan_progress",
      timestamp: new Date().toISOString(),
      data: {
        source: "local",
        message: "Scanning local repository...",
        progress: 0.3,
      },
    });

    await delay(800);
    sendEvent({
      type: "scan_progress",
      timestamp: new Date().toISOString(),
      data: {
        source: "local",
        message: "Found 3 TODO comments, 1 failing test",
        progress: 1.0,
      },
    });

    // Simulate GitHub scan
    await delay(500);
    sendEvent({
      type: "scan_progress",
      timestamp: new Date().toISOString(),
      data: {
        source: "github",
        message: "Fetching open issues and PRs...",
        progress: 0.5,
      },
    });

    await delay(600);
    sendEvent({
      type: "scan_completed",
      timestamp: new Date().toISOString(),
      data: {
        message: "Scan complete. Found 6 signals.",
        signalCount: 6,
      },
    });

    // Simulate planning
    await delay(400);
    sendEvent({
      type: "planning_started",
      timestamp: new Date().toISOString(),
      data: { message: "Generating session plan..." },
    });

    // Generate mock tasks
    const mockTasks = [
      {
        id: `task_${sessionId}_1`,
        title: "Fix failing unit test in auth module",
        description: "The login test is failing due to a mock issue",
        estimatedMinutes: 15,
      },
      {
        id: `task_${sessionId}_2`,
        title: "Address TODO in user service",
        description: "Implement proper error handling for edge cases",
        estimatedMinutes: 20,
      },
      {
        id: `task_${sessionId}_3`,
        title: "Review open PR #42",
        description: "Colleague requested code review",
        estimatedMinutes: 25,
      },
    ];

    for (const task of mockTasks) {
      await delay(300);
      sendEvent({
        type: "task_generated",
        timestamp: new Date().toISOString(),
        data: task,
      });
    }

    await delay(300);
    sendEvent({
      type: "planning_completed",
      timestamp: new Date().toISOString(),
      data: {
        message: "Planning complete. Ready to start session.",
        taskCount: mockTasks.length,
        totalEstimatedMinutes: 60,
      },
    });

    // Keep connection alive with heartbeats
    // TODO(SessionPilot): Implement proper heartbeat mechanism
    // that continues until session ends or client disconnects
  } catch {
    // Stream was closed by client
  } finally {
    try {
      controller.close();
    } catch {
      // Controller already closed
    }
  }
}

// Helper type for creating events
function createEvent(type: SSEEventType, data: unknown): SSEEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}
