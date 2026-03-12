import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { validatePathExists, validatePathWithinRoots } from "@/lib/workspace";
import {
  createRepoRoot,
  deleteRepoRoot,
  listRepoRoots,
} from "@/server/db/queries";
import { serializeRepoRoot } from "@/server/serializers/orchestrator";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { createRepoRootRequestSchema } from "@/server/validation/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const roots = await listRepoRoots();
  return secureJson({
    roots: roots.map(serializeRepoRoot),
  });
}

export async function POST(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const parsed = await readJsonBody(request, createRepoRootRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const pathExists = await validatePathExists(parsed.data.path);
  if (!pathExists.valid) {
    return secureError(pathExists.error ?? "Invalid root path", 400);
  }

  const rootValidation = await validatePathWithinRoots(parsed.data.path);
  if (!rootValidation.valid) {
    return secureError(rootValidation.error ?? "Root path is not allowed", 400);
  }

  const root = await createRepoRoot({
    id: `root_${randomUUID()}`,
    label: parsed.data.label,
    path: parsed.data.path,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return secureJson({
    root: serializeRepoRoot(root),
  });
}

export async function DELETE(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return secureError("Root id is required", 400);
  }

  const deleted = await deleteRepoRoot(id);
  if (!deleted) {
    return secureError("Root not found", 404);
  }

  return secureJson({
    deleted: true,
  });
}
