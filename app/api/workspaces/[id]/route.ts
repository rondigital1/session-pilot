import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from "@/server/db/queries";
import type { CreateWorkspaceRequest } from "@/server/types/domain";
import { validateWorkspace } from "@/lib/workspace";

// Force Node.js runtime
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspaces/[id]
 * Get a single workspace by ID
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const workspace = await getWorkspace(id);

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Failed to get workspace:", error);
    return NextResponse.json(
      { error: "Failed to get workspace" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspaces/[id]
 * Update a workspace
 *
 * Request body:
 * {
 *   name?: string,
 *   localPath?: string,
 *   githubRepo?: string
 * }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: Partial<CreateWorkspaceRequest> = await request.json();

    // Check workspace exists
    const existing = await getWorkspace(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Merge with existing values for validation
    const merged = {
      name: body.name ?? existing.name,
      localPath: body.localPath ?? existing.localPath,
      githubRepo: body.githubRepo ?? existing.githubRepo ?? undefined,
    };

    // Validate the merged configuration
    const validation = await validateWorkspace({
      name: merged.name,
      localPath: merged.localPath,
      githubRepo: merged.githubRepo,
      verifyGitHubRepo: Boolean(process.env.GITHUB_TOKEN),
    });

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Build update object with only provided fields
    const updateData: {
      name?: string;
      localPath?: string;
      githubRepo?: string | null;
    } = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.localPath !== undefined) {
      updateData.localPath = body.localPath;
    }
    if (body.githubRepo !== undefined) {
      updateData.githubRepo = body.githubRepo || null;
    }

    const workspace = await updateWorkspace(id, updateData);

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Failed to update workspace:", error);
    return NextResponse.json(
      { error: "Failed to update workspace" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[id]
 * Delete a workspace
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check workspace exists
    const existing = await getWorkspace(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const deleted = await deleteWorkspace(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete workspace" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete workspace:", error);
    return NextResponse.json(
      { error: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
