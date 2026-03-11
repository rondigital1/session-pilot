/**
 * POST /api/improvement-ideas/:id/feedback
 * Store thumbs up/down + optional reason for an idea
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getIdea, updateIdeaStatus, storeFeedback } from "@/server/db/improveQueries";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { ideaFeedbackRequestSchema } from "@/server/validation/api";

export const runtime = "nodejs";

interface FeedbackBody {
  vote: "up" | "down";
  reason?: string;
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
    const { id: ideaId } = await params;

    // Validate idea exists
    const idea = await getIdea(ideaId);
    if (!idea) {
      return secureError("Idea not found", 404);
    }

    const parsedBody = await readJsonBody<FeedbackBody>(
      request,
      ideaFeedbackRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;

    // Store feedback
    const feedback = await storeFeedback({
      id: `fb_${randomUUID()}`,
      ideaId,
      vote: body.vote,
      reason: body.reason?.trim() || null,
      createdAt: new Date(),
    });

    // Update idea status based on vote
    if (body.vote === "down") {
      await updateIdeaStatus(ideaId, "rejected");
    } else if (body.vote === "up") {
      await updateIdeaStatus(ideaId, "accepted");
    }

    return secureJson({
      feedback: {
        id: feedback.id,
        ideaId: feedback.ideaId,
        vote: feedback.vote,
        reason: feedback.reason,
      },
      ideaStatus: body.vote === "down" ? "rejected" : "accepted",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Feedback] POST failed:", message);
    return secureError(`Failed to store feedback: ${message}`, 500);
  }
}
