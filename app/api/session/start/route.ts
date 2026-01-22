import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSession, getWorkspace } from "@/server/db/queries";
import type { StartSessionRequest, StartSessionResponse } from "@/server/types/domain";
import { runPlanningWorkflow } from "@/server/agent/planningWorkflow";
import { validateCsrfProtection, addSecurityHeaders } from "@/lib/security";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/session/start
 * Start a new coding session
 *
 * SECURITY: Protected by CSRF validation
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
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const body: StartSessionRequest = await request.json();

    // Validate required fields
    if (!body.workspaceId || !body.userGoal || !body.timeBudgetMinutes) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "workspaceId, userGoal, and timeBudgetMinutes are required" },
          { status: 400 }
        )
      );
    }

    // Validate workspace exists
    const workspace = await getWorkspace(body.workspaceId);
    if (!workspace) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Workspace not found" }, { status: 404 })
      );
    }

    // Validate focus weights
    const { focusWeights } = body;
    if (!focusWeights) {
      return addSecurityHeaders(
        NextResponse.json({ error: "focusWeights is required" }, { status: 400 })
      );
    }

    const isValidWeight = (w: number) => typeof w === "number" && w >= 0 && w <= 1;
    if (
      !isValidWeight(focusWeights.bugs) ||
      !isValidWeight(focusWeights.features) ||
      !isValidWeight(focusWeights.refactor)
    ) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "focusWeights values must be numbers between 0 and 1" },
          { status: 400 }
        )
      );
    }

    // Validate time budget
    if (body.timeBudgetMinutes < 15 || body.timeBudgetMinutes > 480) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "timeBudgetMinutes must be between 15 and 480" },
          { status: 400 }
        )
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

    // Trigger async planning workflow (non-blocking)
    // The client should connect to /api/session/[id]/events for real-time updates
    console.log(`[StartSession] Triggering planning workflow for session ${sessionId}`);
    runPlanningWorkflow({
      sessionId,
      workspace,
      userGoal: body.userGoal,
      timeBudgetMinutes: body.timeBudgetMinutes,
      focusWeights,
    }).catch((error) => {
      // Log but don't fail - errors are communicated via SSE
      console.error("[StartSession] Planning workflow error:", error);
    });

    const response: StartSessionResponse = {
      sessionId: session.id,
      status: session.status,
    };

    return addSecurityHeaders(NextResponse.json(response, { status: 201 }));
  } catch (error) {
    console.error("Failed to start session:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to start session" }, { status: 500 })
    );
  }
}

/**
 * Generate a cryptographically secure session ID
 * 
 * SECURITY: Uses crypto.randomUUID() which provides 122 bits of randomness.
 * This prevents session ID guessing attacks.
 */
function generateSessionId(): string {
  return `sess_${randomUUID()}`;
}
