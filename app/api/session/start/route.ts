import { NextRequest, NextResponse } from "next/server";
import { createSession, getWorkspace } from "@/server/db/queries";
import type { StartSessionRequest, StartSessionResponse } from "@/server/types/domain";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/session/start
 * Start a new coding session
 *
 * Request body:
 * {
 *   workspaceId: string,
 *   userGoal: string,           // "What I'm working on"
 *   timeBudgetMinutes: number,  // 60-90 typically
 *   focusWeights: {
 *     bugs: number,      // 0.0-1.0
 *     features: number,  // 0.0-1.0
 *     refactor: number   // 0.0-1.0
 *   }
 * }
 *
 * After creating the session, the client should connect to
 * /api/session/[id]/events for SSE updates during planning.
 */
export async function POST(request: NextRequest) {
  try {
    const body: StartSessionRequest = await request.json();

    // Validate required fields
    if (!body.workspaceId || !body.userGoal || !body.timeBudgetMinutes) {
      return NextResponse.json(
        { error: "workspaceId, userGoal, and timeBudgetMinutes are required" },
        { status: 400 }
      );
    }

    // Validate workspace exists
    const workspace = await getWorkspace(body.workspaceId);
    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Validate focus weights
    const { focusWeights } = body;
    if (!focusWeights) {
      return NextResponse.json(
        { error: "focusWeights is required" },
        { status: 400 }
      );
    }

    const isValidWeight = (w: number) => typeof w === "number" && w >= 0 && w <= 1;
    if (
      !isValidWeight(focusWeights.bugs) ||
      !isValidWeight(focusWeights.features) ||
      !isValidWeight(focusWeights.refactor)
    ) {
      return NextResponse.json(
        { error: "focusWeights values must be numbers between 0 and 1" },
        { status: 400 }
      );
    }

    // Validate time budget
    if (body.timeBudgetMinutes < 15 || body.timeBudgetMinutes > 480) {
      return NextResponse.json(
        { error: "timeBudgetMinutes must be between 15 and 480" },
        { status: 400 }
      );
    }

    const sessionId = generateSessionId();
    const now = new Date();

    const session = await createSession({
      id: sessionId,
      workspaceId: body.workspaceId,
      userGoal: body.userGoal,
      timeBudgetMinutes: body.timeBudgetMinutes,
      focusBugs: focusWeights.bugs,
      focusFeatures: focusWeights.features,
      focusRefactor: focusWeights.refactor,
      status: "planning",
      startedAt: now,
    });

    // TODO(SessionPilot): Trigger async planning workflow here.
    // This should:
    // 1. Run local scanner (server/scanners/localScan.ts)
    // 2. Run GitHub scanner if workspace has githubRepo (server/scanners/githubScan.ts)
    // 3. Store signals in database
    // 4. Pass signals + user goal + focus weights to planning agent
    // 5. Generate tasks and store them
    // 6. Send SSE events throughout this process
    //
    // For now, the client will receive mock events from the /events endpoint.

    const response: StartSessionResponse = {
      sessionId: session.id,
      status: session.status,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Failed to start session:", error);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
