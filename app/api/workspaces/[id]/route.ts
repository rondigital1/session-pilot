import { NextRequest } from "next/server";
import {
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from "@/server/db/queries";
import type { CreateWorkspaceRequest } from "@/server/types/domain";
import { validateWorkspace } from "@/lib/workspace";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { updateWorkspaceRequestSchema } from "@/server/validation/api";

// Force Node.js runtime
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspaces/[id]
 * Get a single workspace by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id } = await params;
    const workspace = await getWorkspace(id);

    if (!workspace) {
      return secureError("Workspace not found", 404);
    }

    return secureJson({ workspace });
  } catch (error) {
    console.error("Failed to get workspace:", error);
    return secureError("Failed to get workspace", 500);
  }
}

/**
 * PUT /api/workspaces/[id]
 * Update a workspace
 *
 * SECURITY: Protected by CSRF validation
 *
 * Request body:
 * {
 *   name?: string,
 *   localPath?: string,
 *   githubRepo?: string
 * }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id } = await params;
    const parsedBody = await readJsonBody<Partial<CreateWorkspaceRequest>>(
      request,
      updateWorkspaceRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const normalizedName = body.name?.trim();
    const normalizedLocalPath = body.localPath?.trim();
    const normalizedGitHubRepo = body.githubRepo?.trim();

    // Check workspace exists
    const existing = await getWorkspace(id);
    if (!existing) {
      return secureError("Workspace not found", 404);
    }

    // Merge with existing values for validation
    const merged = {
      name: normalizedName || existing.name,
      localPath:
        body.localPath === undefined
          ? existing.localPath
          : normalizedLocalPath || undefined,
      githubRepo:
        body.githubRepo === undefined
          ? existing.githubRepo ?? undefined
          : normalizedGitHubRepo || undefined,
    };

    // Validate the merged configuration
    const validation = await validateWorkspace({
      name: merged.name,
      localPath: merged.localPath,
      githubRepo: merged.githubRepo,
      verifyGitHubRepo: Boolean(process.env.GITHUB_TOKEN),
    });

    if (!validation.valid) {
      return secureError(validation.error || "Invalid workspace", 400);
    }

    // Build update object with only provided fields
    const updateData: {
      name?: string;
      localPath?: string | null;
      githubRepo?: string | null;
    } = {};

    if (body.name !== undefined) {
      updateData.name = normalizedName;
    }
    if (body.localPath !== undefined) {
      updateData.localPath = normalizedLocalPath || null;
    }
    if (body.githubRepo !== undefined) {
      updateData.githubRepo = normalizedGitHubRepo || null;
    }

    const workspace = await updateWorkspace(id, updateData);

    return secureJson({ workspace });
  } catch (error) {
    console.error("Failed to update workspace:", error);
    return secureError("Failed to update workspace", 500);
  }
}

/**
 * DELETE /api/workspaces/[id]
 * Delete a workspace
 *
 * SECURITY: Protected by CSRF validation
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id } = await params;

    // Check workspace exists
    const existing = await getWorkspace(id);
    if (!existing) {
      return secureError("Workspace not found", 404);
    }

    const deleted = await deleteWorkspace(id);

    if (!deleted) {
      return secureError("Failed to delete workspace", 500);
    }

    return secureJson({ success: true });
  } catch (error) {
    console.error("Failed to delete workspace:", error);
    return secureError("Failed to delete workspace", 500);
  }
}
