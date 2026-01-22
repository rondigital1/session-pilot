import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listWorkspaces, createWorkspace } from "@/server/db/queries";
import type { CreateWorkspaceRequest } from "@/server/types/domain";
import { validateWorkspace } from "@/lib/workspace";
import { validateCsrfProtection, addSecurityHeaders } from "@/lib/security";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * GET /api/workspaces
 * List all workspaces
 */
export async function GET(request: NextRequest) {
  // SECURITY: Validate CSRF even for GET (prevents info leakage via CORS)
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const workspaces = await listWorkspaces();
    return addSecurityHeaders(NextResponse.json({ workspaces }));
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to list workspaces" }, { status: 500 })
    );
  }
}

/**
 * POST /api/workspaces
 * Create a new workspace
 *
 * SECURITY: Protected by CSRF validation
 *
 * Request body:
 * {
 *   name: string,
 *   localPath?: string,          // Local filesystem path
 *   githubRepo?: string          // Format: "owner/repo"
 * }
 *
 * At least one of localPath or githubRepo must be provided.
 */
export async function POST(request: NextRequest) {
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const body: CreateWorkspaceRequest = await request.json();

    // Validate required fields
    if (!body.name) {
      return addSecurityHeaders(
        NextResponse.json({ error: "name is required" }, { status: 400 })
      );
    }

    if (!body.localPath && !body.githubRepo) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Either localPath or githubRepo must be provided" },
          { status: 400 }
        )
      );
    }

    // Validate workspace configuration
    const validation = await validateWorkspace({
      name: body.name,
      localPath: body.localPath,
      githubRepo: body.githubRepo,
      verifyGitHubRepo: Boolean(process.env.GITHUB_TOKEN),
    });

    if (!validation.valid) {
      return addSecurityHeaders(
        NextResponse.json({ error: validation.error }, { status: 400 })
      );
    }

    const id = generateId();
    const now = new Date();

    const workspace = await createWorkspace({
      id,
      name: body.name,
      localPath: body.localPath || null,
      githubRepo: body.githubRepo || null,
      createdAt: now,
      updatedAt: now,
    });

    return addSecurityHeaders(NextResponse.json({ workspace }, { status: 201 }));
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to create workspace" }, { status: 500 })
    );
  }
}

/**
 * Generate a cryptographically secure workspace ID
 * 
 * SECURITY: Uses crypto.randomUUID() for unpredictable IDs
 */
function generateId(): string {
  return `ws_${randomUUID()}`;
}
