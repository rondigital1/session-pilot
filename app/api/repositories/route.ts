import { NextRequest } from "next/server";
import {
  getLatestAnalysisRunForRepository,
  listRepositories,
} from "@/server/db/queries";
import { serializeRepository } from "@/server/serializers/orchestrator";
import { secureJson, validateApiAccess } from "@/server/api/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const repositories = await listRepositories();
  const payload = await Promise.all(
    repositories.map(async (repository) => {
      const latestAnalysis = await getLatestAnalysisRunForRepository(repository.id);
      return serializeRepository(repository, { lastAnalysisRunId: latestAnalysis?.id ?? null });
    })
  );

  return secureJson({
    repositories: payload,
  });
}
