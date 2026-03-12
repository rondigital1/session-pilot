import { NextRequest } from "next/server";
import { executionOrchestrator } from "@/server/execution/executionOrchestrator";
import { secureJson, validateApiAccess } from "@/server/api/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const { id } = await params;
  await executionOrchestrator.cancel(id);

  return secureJson({
    cancelled: true,
  });
}
