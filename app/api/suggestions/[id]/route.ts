import { NextRequest } from "next/server";
import {
  getLatestAnalysisRunForRepository,
  getRepository,
  getSuggestion,
} from "@/server/db/queries";
import {
  serializeAnalysisRun,
  serializeRepository,
  serializeSuggestion,
} from "@/server/serializers/orchestrator";
import { secureError, secureJson, validateApiAccess } from "@/server/api/http";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const { id } = await params;
  const suggestion = await getSuggestion(id);
  if (!suggestion) {
    return secureError("Suggestion not found", 404);
  }

  const repository = await getRepository(suggestion.repositoryId);
  if (!repository) {
    return secureError("Repository not found", 404);
  }

  const analysis = await getLatestAnalysisRunForRepository(repository.id);

  return secureJson({
    suggestion: serializeSuggestion(suggestion),
    repository: serializeRepository(repository, { lastAnalysisRunId: analysis?.id ?? null }),
    analysis: analysis ? serializeAnalysisRun(analysis) : null,
  });
}
