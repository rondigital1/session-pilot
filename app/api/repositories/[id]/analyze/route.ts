import { NextRequest } from "next/server";
import { analyzeRepository } from "@/server/repos/repoAnalysisService";
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
  const result = await analyzeRepository(id);

  return secureJson(result);
}
