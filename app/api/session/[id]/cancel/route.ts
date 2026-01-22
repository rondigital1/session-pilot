import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSessionStatus } from "@/server/db/queries";
import { emitSessionEvent } from "@/lib/session/events";
import type { CancelSessionResponse } from "@/server/types/domain";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/session/[id]/cancel
 * Cancel an in-progress session (e.g., during planning phase)
 *
 * Response:
 * {
 *   sessionId: string,
 *   cancelled: boolean
 * }
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check session can be cancelled
    if (session.status === "completed" || session.status === "cancelled") {
      return NextResponse.json(
        { error: `Session is already ${session.status}` },
        { status: 400 }
      );
    }

    // Update session status to cancelled
    await updateSessionStatus(sessionId, "cancelled");

    // Emit cancellation event to close any SSE connections
    await emitSessionEvent(sessionId, "session_ended", {
      sessionId,
      message: "Session cancelled by user",
      cancelled: true,
    });

    const response: CancelSessionResponse = {
      sessionId,
      cancelled: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to cancel session:", error);
    return NextResponse.json(
      { error: "Failed to cancel session" },
      { status: 500 }
    );
  }
}
