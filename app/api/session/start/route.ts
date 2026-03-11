import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createSession, getWorkspace } from "@/server/db/queries";
import type { StartSessionRequest, StartSessionResponse } from "@/server/types/domain";
import { runPlanningWorkflow } from "@/server/agent/planningWorkflow";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { startSessionRequestSchema } from "@/server/validation/api";

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
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const parsedBody = await readJsonBody<StartSessionRequest>(
      request,
      startSessionRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;

    // Validate workspace exists
    const workspace = await getWorkspace(body.workspaceId);
    if (!workspace) {
      return secureError("Workspace not found", 404);
    }
    const focusWeights = body.focusWeights;

    const sessionId = generateSessionId();
    const now = new Date();

    const session = await createSession({
      id: sessionId,
      workspaceId: body.workspaceId,
      userGoal: body.userGoal.trim(),
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
      userGoal: body.userGoal.trim(),
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

    return secureJson(response, 201);
  } catch (error) {
    console.error("Failed to start session:", error);
    return secureError("Failed to start session", 500);
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
