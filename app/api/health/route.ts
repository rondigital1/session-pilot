import { NextRequest } from "next/server";
import { listWorkspaces } from "@/server/db/queries";
import { secureJson, validateApiAccess } from "@/server/api/http";
import { getRuntimeDiagnostics } from "@/server/config/runtime";
import type { SystemHealthReport } from "@/server/types/domain";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const runtimeDiagnostics = await getRuntimeDiagnostics();
  const timestamp = new Date().toISOString();

  try {
    const workspaces = await listWorkspaces();

    const payload: SystemHealthReport = {
      status: runtimeDiagnostics.status,
      timestamp,
      warnings: runtimeDiagnostics.warnings,
      checks: {
        ...runtimeDiagnostics.checks,
        database: {
          status: "ok",
          message: "Database is reachable.",
          workspaceCount: workspaces.length,
        },
      },
    };

    return secureJson(payload);
  } catch (error) {
    console.error("Health check failed:", error);

    const payload: SystemHealthReport = {
      status: "degraded",
      timestamp,
      warnings: [...runtimeDiagnostics.warnings, "Database is not reachable."],
      checks: {
        ...runtimeDiagnostics.checks,
        database: {
          status: "error",
          message: "Database initialization failed.",
        },
      },
    };

    return secureJson(payload, 503);
  }
}
