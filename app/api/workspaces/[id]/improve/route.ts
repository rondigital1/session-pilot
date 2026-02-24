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

import { NextRequest, NextResponse } from "next/server";
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
import { addSecurityHeaders } from "@/lib/security";

export const runtime = "nodejs";

// =============================================================================
// POST - Run improvement scan
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params;
    const force = request.nextUrl.searchParams.get("force") === "1";

    // Validate workspace
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Workspace not found" }, { status: 404 })
      );
    }

    if (!workspace.localPath) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Workspace has no local path configured" },
          { status: 400 }
        )
      );
    }

    // Parse optional body
    let goalText: string | undefined;
    let timeBudgetMinutes: number | undefined;
    try {
      const body = await request.json();
      goalText = body.goalText;
      timeBudgetMinutes = body.timeBudgetMinutes;
    } catch {
      // No body is fine
    }

    // Build snapshot
    const snapshot = await buildProjectSnapshot({
      workspaceId,
      localPath: workspace.localPath,
    });

    // Validate snapshot with Zod
    const validated = ProjectSnapshotV1Schema.safeParse(snapshot);
    if (!validated.success) {
      console.error("[Improve] Snapshot validation failed:", validated.error);
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Snapshot validation failed", details: validated.error.format() },
          { status: 500 }
        )
      );
    }

    // Check cache: if latest snapshot has same hash, reuse ideas
    if (!force) {
      const existing = await getLatestSnapshot(workspaceId);
      if (existing && existing.snapshotHash === snapshot.snapshotHash) {
        const cachedIdeas = await getIdeasForSnapshot(existing.id);
        if (cachedIdeas.length > 0) {
          const parsedSnapshot = JSON.parse(existing.snapshotData);
          return addSecurityHeaders(
            NextResponse.json({
              snapshot: parsedSnapshot,
              ideas: cachedIdeas.map(formatIdeaForApi),
              cached: true,
            })
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
    const ideasToStore = ideas.map((idea, index) => ({
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

    return addSecurityHeaders(
      NextResponse.json({
        snapshot,
        ideas: storedIdeas.map(formatIdeaForApi),
        cached: false,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Improve] POST failed:", message);
    return addSecurityHeaders(
      NextResponse.json({ error: `Improve scan failed: ${message}` }, { status: 500 })
    );
  }
}

// =============================================================================
// GET - Latest snapshot + ideas
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params;

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Workspace not found" }, { status: 404 })
      );
    }

    const latestSnapshot = await getLatestSnapshot(workspaceId);
    if (!latestSnapshot) {
      return addSecurityHeaders(
        NextResponse.json({
          snapshot: null,
          ideas: [],
          message: "No improvement scan has been run yet",
        })
      );
    }

    const ideas = await getIdeasForSnapshot(latestSnapshot.id);
    const parsedSnapshot = JSON.parse(latestSnapshot.snapshotData);

    return addSecurityHeaders(
      NextResponse.json({
        snapshot: parsedSnapshot,
        ideas: ideas.map(formatIdeaForApi),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Improve] GET failed:", message);
    return addSecurityHeaders(
      NextResponse.json({ error: `Failed to fetch improvements: ${message}` }, { status: 500 })
    );
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
