/**
 * POST /api/improvement-ideas/:id/feedback
 * Store thumbs up/down + optional reason for an idea
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getIdea, updateIdeaStatus, storeFeedback } from "@/server/db/improveQueries";
import { addSecurityHeaders } from "@/lib/security";

export const runtime = "nodejs";

interface FeedbackBody {
  vote: "up" | "down";
  reason?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ideaId } = await params;

    // Validate idea exists
    const idea = await getIdea(ideaId);
    if (!idea) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Idea not found" }, { status: 404 })
      );
    }

    // Parse and validate body
    const body: FeedbackBody = await request.json();
    if (body.vote !== "up" && body.vote !== "down") {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "vote must be 'up' or 'down'" },
          { status: 400 }
        )
      );
    }

    // Store feedback
    const feedback = await storeFeedback({
      id: `fb_${randomUUID()}`,
      ideaId,
      vote: body.vote,
      reason: body.reason ?? null,
      createdAt: new Date(),
    });

    // Update idea status based on vote
    if (body.vote === "down") {
      await updateIdeaStatus(ideaId, "rejected");
    } else if (body.vote === "up") {
      await updateIdeaStatus(ideaId, "accepted");
    }

    return addSecurityHeaders(
      NextResponse.json({
        feedback: {
          id: feedback.id,
          ideaId: feedback.ideaId,
          vote: feedback.vote,
          reason: feedback.reason,
        },
        ideaStatus: body.vote === "down" ? "rejected" : "accepted",
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Feedback] POST failed:", message);
    return addSecurityHeaders(
      NextResponse.json({ error: `Failed to store feedback: ${message}` }, { status: 500 })
    );
  }
}
