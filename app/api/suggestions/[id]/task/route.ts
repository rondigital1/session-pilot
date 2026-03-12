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
import { executionProviderIdSchema } from "@/server/validation/api";
import { buildAgentPrompt } from "@/server/tasks/promptGenerationService";
import { buildTaskSpec } from "@/server/tasks/taskSpecService";
import { secureError, secureJson, validateApiAccess } from "@/server/api/http";
import type { SuggestionTaskResponse } from "@/server/types/domain";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const providerResult = executionProviderIdSchema.safeParse(
    request.nextUrl.searchParams.get("providerId") ?? "codex-cli"
  );
  if (!providerResult.success) {
    return secureError("Unsupported providerId", 400, providerResult.error.flatten());
  }

  const { id } = await params;
  const suggestionRow = await getSuggestion(id);

  if (!suggestionRow) {
    return secureError("Suggestion not found", 404);
  }

  const repositoryRow = await getRepository(suggestionRow.repositoryId);
  if (!repositoryRow) {
    return secureError("Repository not found", 404);
  }

  const analysisRow = await getLatestAnalysisRunForRepository(repositoryRow.id);
  if (!analysisRow) {
    return secureError("Repository analysis not found", 404);
  }

  const repository = serializeRepository(repositoryRow, { lastAnalysisRunId: analysisRow.id });
  const analysis = serializeAnalysisRun(analysisRow);
  const suggestion = serializeSuggestion(suggestionRow);
  const taskSpec = buildTaskSpec(repository, analysis, suggestion);
  const prompt = buildAgentPrompt(repository, analysis, taskSpec, providerResult.data);

  const response: SuggestionTaskResponse = {
    repository,
    analysis,
    suggestion,
    taskSpec,
    prompt,
  };

  return secureJson(response);
}
