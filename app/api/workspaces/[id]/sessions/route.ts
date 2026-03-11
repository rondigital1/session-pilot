import { NextRequest } from "next/server";
import {
  getWorkspace,
  listSessionSummariesForWorkspace,
  listSessionsForWorkspace,
} from "@/server/db/queries";
import { secureError, secureJson, validateApiAccess } from "@/server/api/http";
import type { UISessionHistoryItem } from "@/server/types/domain";
import { serializeSessionMetrics } from "@/server/serializers/session";

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
    const { id: workspaceId } = await params;
    const workspace = await getWorkspace(workspaceId);

    if (!workspace) {
      return secureError("Workspace not found", 404);
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 8;
    if (Number.isNaN(limit) || limit < 1 || limit > 50) {
      return secureError("limit must be an integer between 1 and 50", 400);
    }

    const [sessions, summaries] = await Promise.all([
      listSessionsForWorkspace(workspaceId),
      listSessionSummariesForWorkspace(workspaceId),
    ]);

    const summaryBySessionId = new Map(
      summaries.map((summary) => [
        summary.sessionId,
        {
          summary: summary.summary,
          metrics: serializeSessionMetrics(summary),
        },
      ])
    );

    const items: UISessionHistoryItem[] = sessions.slice(0, limit).map((session) => {
      const summaryRow = summaryBySessionId.get(session.id);
      return {
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
        summary: summaryRow?.summary ?? session.summary,
        metrics: summaryRow?.metrics ?? null,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
      };
    });

    return secureJson({ sessions: items });
  } catch (error) {
    console.error("Failed to list workspace sessions:", error);
    return secureError("Failed to list workspace sessions", 500);
  }
}
