/**
 * POST /api/workspaces/:id/improve
 * Run scan -> snapshot -> ideas -> store -> return ideas
 *
 * GET /api/workspaces/:id/improve
 * Alias for /improve/latest (returns latest snapshot + ideas)
 *
 * Query params:
 *   ?force=1  - Force refresh even if snapshot hash matches
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getWorkspace } from "@/server/db/queries";
import {
  storeSnapshot,
  getLatestSnapshot,
  storeIdeas,
  getIdeasForSnapshot,
  getRecentlyRejectedIdeaTitles,
} from "@/server/db/improveQueries";
import { buildProjectSnapshot } from "@/server/snapshot/buildSnapshot";
import { generateImprovementIdeas } from "@/server/improve/generateIdeas";
import { ProjectSnapshotV1Schema } from "@/server/snapshot/schema";
import {
  readOptionalJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { improveScanRequestSchema } from "@/server/validation/api";

export const runtime = "nodejs";

// =============================================================================
// POST - Run improvement scan
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id: workspaceId } = await params;
    const force = request.nextUrl.searchParams.get("force") === "1";

    // Validate workspace
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return secureError("Workspace not found", 404);
    }

    if (!workspace.localPath) {
      return secureError("Workspace has no local path configured", 400);
    }

    const parsedBody = await readOptionalJsonBody(request, improveScanRequestSchema);
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const goalText = parsedBody.data?.goalText?.trim() || undefined;
    const timeBudgetMinutes = parsedBody.data?.timeBudgetMinutes;

    // Build snapshot
    const snapshot = await buildProjectSnapshot({
      workspaceId,
      localPath: workspace.localPath,
    });

    // Validate snapshot with Zod
    const validated = ProjectSnapshotV1Schema.safeParse(snapshot);
    if (!validated.success) {
      console.error("[Improve] Snapshot validation failed:", validated.error);
      return secureError(
        "Snapshot validation failed",
        500,
        validated.error.format()
      );
    }

    // Check cache: if latest snapshot has same hash, reuse ideas
    if (!force) {
      const existing = await getLatestSnapshot(workspaceId);
      if (existing && existing.snapshotHash === snapshot.snapshotHash) {
        const cachedIdeas = await getIdeasForSnapshot(existing.id);
        if (cachedIdeas.length > 0) {
          const parsedSnapshot = safeParseStoredSnapshot(existing.snapshotData);
          if (parsedSnapshot) {
            return secureJson({
              snapshot: parsedSnapshot,
              ideas: cachedIdeas.map(formatIdeaForApi),
              cached: true,
            });
          }
          console.warn(
            `[Improve] Cached snapshot ${existing.id} could not be parsed, regenerating`
          );
        }
      }
    }

    // Store new snapshot
    const snapshotId = `snap_${randomUUID()}`;
    await storeSnapshot({
      id: snapshotId,
      workspaceId,
      snapshotHash: snapshot.snapshotHash,
      snapshotData: JSON.stringify(snapshot),
      createdAt: new Date(),
    });

    // Get recently rejected idea titles for anti-repeat
    const rejectedTitles = await getRecentlyRejectedIdeaTitles(workspaceId);

    // Generate ideas
    const ideas = await generateImprovementIdeas({
      snapshot,
      rejectedTitles,
      timeBudgetMinutes,
      goalText,
    });

    // Store ideas
    const ideasToStore = ideas.map((idea) => ({
      id: `idea_${randomUUID()}`,
      workspaceId,
      snapshotId,
      title: idea.title,
      category: idea.category,
      impact: idea.impact,
      effort: idea.effort,
      risk: idea.risk,
      confidence: idea.confidence,
      score: idea.score,
      evidence: JSON.stringify(idea.evidence),
      acceptanceCriteria: JSON.stringify(idea.acceptanceCriteria),
      steps: JSON.stringify(idea.steps),
      status: "active" as const,
      createdAt: new Date(),
    }));

    const storedIdeas = await storeIdeas(ideasToStore);

    return secureJson({
      snapshot,
      ideas: storedIdeas.map(formatIdeaForApi),
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Improve] POST failed:", message);
    return secureError(`Improve scan failed: ${message}`, 500);
  }
}

// =============================================================================
// GET - Latest snapshot + ideas
// =============================================================================

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

    const latestSnapshot = await getLatestSnapshot(workspaceId);
    if (!latestSnapshot) {
      return secureJson({
        snapshot: null,
        ideas: [],
        message: "No improvement scan has been run yet",
      });
    }

    const ideas = await getIdeasForSnapshot(latestSnapshot.id);
    const parsedSnapshot = safeParseStoredSnapshot(latestSnapshot.snapshotData);
    if (!parsedSnapshot) {
      return secureError("Stored snapshot data is invalid", 500);
    }

    return secureJson({
      snapshot: parsedSnapshot,
      ideas: ideas.map(formatIdeaForApi),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Improve] GET failed:", message);
    return secureError(`Failed to fetch improvements: ${message}`, 500);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatIdeaForApi(idea: {
  id: string;
  title: string;
  category: string;
  impact: string;
  effort: string;
  risk: string;
  confidence: number;
  score: number;
  evidence: string;
  acceptanceCriteria: string;
  steps: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: idea.id,
    title: idea.title,
    category: idea.category,
    impact: idea.impact,
    effort: idea.effort,
    risk: idea.risk,
    confidence: idea.confidence,
    score: idea.score,
    evidence: JSON.parse(idea.evidence),
    acceptanceCriteria: JSON.parse(idea.acceptanceCriteria),
    steps: JSON.parse(idea.steps),
    status: idea.status,
    createdAt: idea.createdAt,
  };
}

function safeParseStoredSnapshot(rawSnapshot: string) {
  try {
    return JSON.parse(rawSnapshot);
  } catch {
    return null;
  }
}
