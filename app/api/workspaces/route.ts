import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { listWorkspaces, createWorkspace } from "@/server/db/queries";
import type { CreateWorkspaceRequest } from "@/server/types/domain";
import { validateWorkspace } from "@/lib/workspace";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { createWorkspaceRequestSchema } from "@/server/validation/api";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * GET /api/workspaces
 * List all workspaces
 */
export async function GET(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const workspaces = await listWorkspaces();
    return secureJson({ workspaces });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return secureError("Failed to list workspaces", 500);
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
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const parsedBody = await readJsonBody<CreateWorkspaceRequest>(
      request,
      createWorkspaceRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const localPath = body.localPath?.trim() || undefined;
    const githubRepo = body.githubRepo?.trim() || undefined;

    // Validate workspace configuration
    const validation = await validateWorkspace({
      name: body.name.trim(),
      localPath,
      githubRepo,
      verifyGitHubRepo: Boolean(process.env.GITHUB_TOKEN),
    });

    if (!validation.valid) {
      return secureError(validation.error || "Invalid workspace", 400);
    }

    const id = generateId();
    const now = new Date();

    const workspace = await createWorkspace({
      id,
      name: body.name.trim(),
      localPath: localPath || null,
      githubRepo: githubRepo || null,
      createdAt: now,
      updatedAt: now,
    });

    return secureJson({ workspace }, 201);
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return secureError("Failed to create workspace", 500);
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
