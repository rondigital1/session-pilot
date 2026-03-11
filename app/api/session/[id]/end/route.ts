import { NextRequest } from "next/server";
import {
  endSession,
  getSession,
  getSessionSummary,
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
  formatSessionSummary,
  getTasksByStatus,
  extractTaskNotes,
} from "@/lib/session";
import { generateSummary } from "@/server/agent";
import {
  readOptionalJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { serializeSessionMetrics } from "@/server/serializers/session";
import { endSessionRequestSchema } from "@/server/validation/api";

export const runtime = "nodejs";

function buildSessionMetrics(
  tasks: Awaited<ReturnType<typeof listSessionTasks>>,
  startedAt: Date,
  endedAt: Date
): SessionMetrics {
  const tasksCompleted = tasks.filter((task) => task.status === "completed").length;
  const tasksTotal = tasks.length;
  const tasksPending = tasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress"
  ).length;
  const tasksSkipped = tasks.filter((task) => task.status === "skipped").length;
  const completionRate =
    tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const totalEstimatedMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimatedMinutes ?? 0),
    0
  );
  const actualDurationMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
  );

  return {
    tasksCompleted,
    tasksTotal,
    tasksPending,
    tasksSkipped,
    completionRate,
    totalEstimatedMinutes,
    actualDurationMinutes,
  };
}

function buildEndSessionResponse(
  sessionId: string,
  summary: string,
  metrics: SessionMetrics
): EndSessionResponse {
  return {
    sessionId,
    summary,
    tasksCompleted: metrics.tasksCompleted,
    tasksTotal: metrics.tasksTotal,
    metrics,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id: sessionId } = await params;
    const parsedBody = await readOptionalJsonBody<EndSessionRequest>(
      request,
      endSessionRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data ?? {};

    const session = await getSession(sessionId);
    if (!session) {
      return secureError("Session not found", 404);
    }

    const tasks = await listSessionTasks(sessionId);

    if (session.status === "completed") {
      const existingSummary = await getSessionSummary(sessionId);
      const endedAt = session.endedAt ?? existingSummary?.createdAt ?? new Date();
      const metrics = existingSummary
        ? serializeSessionMetrics(existingSummary)
        : buildSessionMetrics(tasks, session.startedAt, endedAt);

      return secureJson(
        buildEndSessionResponse(
          sessionId,
          existingSummary?.summary ??
            session.summary ??
            body.summary?.trim() ??
            "Session already completed.",
          metrics
        )
      );
    }

    if (session.status === "cancelled") {
      return secureError("Session is already cancelled", 400);
    }

    const endedAt = new Date();
    const metrics = buildSessionMetrics(tasks, session.startedAt, endedAt);

    let summary: string;
    if (body.summary?.trim()) {
      const { completed, pending } = getTasksByStatus(tasks);
      const notes = extractTaskNotes(tasks);
      summary = formatSessionSummary({
        overview: body.summary.trim(),
        completedTasks: completed,
        pendingTasks: pending,
        notes,
      });
    } else {
      const { completed, pending } = getTasksByStatus(tasks);
      const notes = extractTaskNotes(tasks);
      let overview: string;

      try {
        overview = await generateSummary({
          userGoal: session.userGoal,
          completedTasks: completed,
          pendingTasks: pending,
          notes,
        });
      } catch (error) {
        console.warn("Failed to generate AI summary, using template:", error);
        overview = generateTemplateSummary(
          {
            userGoal: session.userGoal,
            timeBudgetMinutes: session.timeBudgetMinutes,
          },
          tasks,
          metrics.tasksCompleted
        );
      }

      summary = formatSessionSummary({
        overview,
        completedTasks: completed,
        pendingTasks: pending,
        notes,
      });
    }

    const updatedSession = await endSession(sessionId, summary);
    if (!updatedSession) {
      return secureError("Failed to end session", 500);
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

    return secureJson(buildEndSessionResponse(sessionId, summary, metrics));
  } catch (error) {
    console.error("Failed to end session:", error);
    return secureError("Failed to end session", 500);
  }
}
