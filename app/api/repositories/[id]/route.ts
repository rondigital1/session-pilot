import { NextRequest } from "next/server";
import {
  getLatestAnalysisRunForRepository,
  getRepository,
  listExecutionTasksForRepository,
  listSuggestionsForAnalysisRun,
} from "@/server/db/queries";
import {
  serializeAnalysisRun,
  serializeExecutionTask,
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
  const repository = await getRepository(id);

  if (!repository) {
    return secureError("Repository not found", 404);
  }

  const latestAnalysis = await getLatestAnalysisRunForRepository(id);
  const suggestions = latestAnalysis
    ? await listSuggestionsForAnalysisRun(latestAnalysis.id)
    : [];
  const executions = await listExecutionTasksForRepository(id);

  return secureJson({
    repository: serializeRepository(repository, { lastAnalysisRunId: latestAnalysis?.id ?? null }),
    analysis: latestAnalysis ? serializeAnalysisRun(latestAnalysis) : null,
    suggestions: suggestions.map(serializeSuggestion),
    executions: executions.map(serializeExecutionTask),
  });
}
