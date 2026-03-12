import { NextRequest } from "next/server";
import { getExecutionTaskRecord } from "@/server/db/queries";
import { emitExecutionEvent, pollExecutionEvents } from "@/server/events/runEventStore";
import { addSecurityHeaders } from "@/lib/security";
import { safeClose } from "@/lib/sse";
import { secureError, validateApiAccess } from "@/server/api/http";

export const runtime = "nodejs";

const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 15000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const { id } = await params;
  const execution = await getExecutionTaskRecord(id);
  if (!execution) {
    return secureError("Execution not found", 404);
  }

  const encoder = new TextEncoder();
  let lastEventId = 0;
  let isClosed = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      function cleanup() {
        isClosed = true;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      }

      async function sendEvents() {
        if (isClosed) {
          return;
        }

        try {
          const result = await pollExecutionEvents(id, lastEventId);
          for (const event of result.events) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
          lastEventId = result.lastId;

          if (result.isComplete) {
            cleanup();
            safeClose(controller);
          }
        } catch (error) {
          void emitExecutionEvent(id, "failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          cleanup();
          safeClose(controller);
        }
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: 0,
            executionTaskId: id,
            type: "status",
            timestamp: new Date().toISOString(),
            data: { status: execution.status, message: "Connected to execution stream." },
          })}\n\n`
        )
      );

      void sendEvents();
      pollInterval = setInterval(() => {
        void sendEvents();
      }, POLL_INTERVAL_MS);
      heartbeatInterval = setInterval(() => {
        if (isClosed) {
          return;
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: -1,
              executionTaskId: id,
              type: "log",
              timestamp: new Date().toISOString(),
              data: { heartbeat: true },
            })}\n\n`
          )
        );
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        cleanup();
        safeClose(controller);
      });
    },
  });

  return addSecurityHeaders(
    new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  );
}
