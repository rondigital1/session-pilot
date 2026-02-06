import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/db/queries";
import { generateTaskChecklist } from "@/server/agent";
import type { GenerateChecklistRequest } from "@/server/types/domain";
import { validateCsrfProtection, addSecurityHeaders } from "@/lib/security";

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
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const { id: sessionId } = await params;
    const body = (await request.json()) as GenerateChecklistRequest;

    if (!body.description?.trim()) {
      return addSecurityHeaders(
        NextResponse.json({ error: "description is required" }, { status: 400 })
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    const items = await generateTaskChecklist({
      title: body.title?.trim() || undefined,
      description: body.description.trim(),
    });

    return addSecurityHeaders(NextResponse.json({ items }));
  } catch (error) {
    console.error("Failed to generate checklist:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to generate checklist" }, { status: 500 })
    );
  }
}
