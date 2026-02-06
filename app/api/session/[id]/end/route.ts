import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  endSession,
  listSessionTasks,
  storeSessionSummary,
} from "@/server/db/queries";
import type {
  EndSessionRequest,
  EndSessionResponse,
  SessionMetrics,
} from "@/server/types/domain";
import {
  generateTemplateSummary,
  getTasksByStatus,
  extractTaskNotes,
} from "@/lib/session";
import { generateSummary } from "@/server/agent";
import { validateCsrfProtection, addSecurityHeaders } from "@/lib/security";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/session/[id]/end
 * End a session and generate a summary
 *
 * SECURITY: Protected by CSRF validation
 *
 * Request body (optional):
 * {
 *   summary?: string  // Override the generated summary
 * }
 *
 * Response:
 * {
 *   sessionId: string,
 *   summary: string,
 *   tasksCompleted: number,
 *   tasksTotal: number
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const { id: sessionId } = await params;
    let body: EndSessionRequest = {};

    try {
      body = await request.json();
    } catch {
      // Body is optional, ignore parse errors
    }

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Check session can be ended
    if (session.status === "completed" || session.status === "cancelled") {
      return addSecurityHeaders(
        NextResponse.json({ error: `Session is already ${session.status}` }, { status: 400 })
      );
    }

    // Get task statistics
    const tasks = await listSessionTasks(sessionId);
    const tasksCompleted = tasks.filter((t) => t.status === "completed").length;
    const tasksTotal = tasks.length;
    const tasksPending = tasks.filter(
      (t) => t.status === "pending" || t.status === "in_progress"
    ).length;
    const tasksSkipped = tasks.filter((t) => t.status === "skipped").length;
    const completionRate =
      tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
    const totalEstimatedMinutes = tasks.reduce(
      (sum, task) => sum + (task.estimatedMinutes ?? 0),
      0
    );
    const endedAt = new Date();
    const actualDurationMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000)
    );

    const metrics: SessionMetrics = {
      tasksCompleted,
      tasksTotal,
      tasksPending,
      tasksSkipped,
      completionRate,
      totalEstimatedMinutes,
      actualDurationMinutes,
    };

    // Generate or use provided summary
    let summary: string;
    if (body.summary) {
      summary = body.summary;
    } else {
      const { completed, pending } = getTasksByStatus(tasks);
      const notes = extractTaskNotes(tasks);

      try {
        summary = await generateSummary({
          userGoal: session.userGoal,
          completedTasks: completed,
          pendingTasks: pending,
          notes,
        });
      } catch (error) {
        console.warn("Failed to generate AI summary, using template:", error);
        summary = generateTemplateSummary(
          {
            userGoal: session.userGoal,
            timeBudgetMinutes: session.timeBudgetMinutes,
          },
          tasks,
          tasksCompleted
        );
      }
    }

    // Update session in database
    const updatedSession = await endSession(sessionId, summary);

    if (!updatedSession) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Failed to end session" }, { status: 500 })
      );
    }

    await storeSessionSummary({
      id: `sum_${sessionId}`,
      sessionId,
      workspaceId: session.workspaceId,
      summary,
      tasksCompleted: metrics.tasksCompleted,
      tasksTotal: metrics.tasksTotal,
      tasksPending: metrics.tasksPending,
      tasksSkipped: metrics.tasksSkipped,
      completionRate: metrics.completionRate,
      totalEstimatedMinutes: metrics.totalEstimatedMinutes,
      actualDurationMinutes: metrics.actualDurationMinutes,
      createdAt: endedAt,
    });

    const response: EndSessionResponse = {
      sessionId,
      summary,
      tasksCompleted,
      tasksTotal,
      metrics,
    };

    return addSecurityHeaders(NextResponse.json(response));
  } catch (error) {
    console.error("Failed to end session:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to end session" }, { status: 500 })
    );
  }
}
