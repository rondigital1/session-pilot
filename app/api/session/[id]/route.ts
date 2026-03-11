import { NextRequest } from "next/server";
import {
  getSession,
  getSessionSummary,
  listSessionTasks,
} from "@/server/db/queries";
import { secureError, secureJson, validateApiAccess } from "@/server/api/http";
import type { UISession } from "@/server/types/domain";
import {
  serializeSessionMetrics,
  serializeSessionTask,
} from "@/server/serializers/session";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return secureError("Session not found", 404);
    }

    const [tasks, summaryRow] = await Promise.all([
      listSessionTasks(sessionId),
      getSessionSummary(sessionId),
    ]);

    const payload: UISession = {
      id: session.id,
      workspaceId: session.workspaceId,
      userGoal: session.userGoal,
      timeBudgetMinutes: session.timeBudgetMinutes,
      focusWeights: {
        bugs: session.focusBugs,
        features: session.focusFeatures,
        refactor: session.focusRefactor,
      },
      status: session.status,
      tasks: tasks.map(serializeSessionTask),
      summary: summaryRow?.summary ?? session.summary ?? undefined,
      metrics: summaryRow ? serializeSessionMetrics(summaryRow) : undefined,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    };

    return secureJson({ session: payload });
  } catch (error) {
    console.error("Failed to load session:", error);
    return secureError("Failed to load session", 500);
  }
}
