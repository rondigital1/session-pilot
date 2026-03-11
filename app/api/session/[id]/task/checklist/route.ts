import { NextRequest } from "next/server";
import { getSession } from "@/server/db/queries";
import { generateTaskChecklist } from "@/server/agent";
import type { GenerateChecklistRequest } from "@/server/types/domain";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { generateChecklistRequestSchema } from "@/server/validation/api";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/session/[id]/task/checklist
 * Generate checklist items from a task title/description
 */
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
    const parsedBody = await readJsonBody<GenerateChecklistRequest>(
      request,
      generateChecklistRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;

    const session = await getSession(sessionId);
    if (!session) {
      return secureError("Session not found", 404);
    }

    const items = await generateTaskChecklist({
      title: body.title?.trim() || undefined,
      description: body.description.trim(),
    });

    return secureJson({ items });
  } catch (error) {
    console.error("Failed to generate checklist:", error);
    return secureError("Failed to generate checklist", 500);
  }
}
