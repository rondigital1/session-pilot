import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  createExecutionTaskRecord,
  getLatestAnalysisRunForRepository,
  getRepository,
  getSuggestion,
} from "@/server/db/queries";
import { serializeExecutionTask, serializeAnalysisRun, serializeRepository, serializeSuggestion } from "@/server/serializers/orchestrator";
import { executionOrchestrator } from "@/server/execution/executionOrchestrator";
import { buildAgentPrompt } from "@/server/tasks/promptGenerationService";
import { buildTaskSpec } from "@/server/tasks/taskSpecService";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { createExecutionRequestSchema } from "@/server/validation/api";
import type { CreateExecutionResponse } from "@/server/types/domain";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  const parsed = await readJsonBody(request, createExecutionRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const suggestionRow = await getSuggestion(parsed.data.suggestionId);
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
  const prompt = buildAgentPrompt(repository, analysis, taskSpec, parsed.data.providerId);

  const execution = await createExecutionTaskRecord({
    id: `execution_${randomUUID()}`,
    repositoryId: repository.id,
    suggestionId: suggestion.id,
    providerId: parsed.data.providerId,
    status: "queued",
    branchName: null,
    worktreePath: null,
    taskSpecJson: JSON.stringify(taskSpec),
    agentPrompt: prompt.prompt,
    validationCommandsJson: JSON.stringify(taskSpec.validationCommands),
    validationResultsJson: JSON.stringify([]),
    finalMessage: null,
    error: null,
    startedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
  });

  await executionOrchestrator.start(execution.id);

  const response: CreateExecutionResponse = {
    execution: serializeExecutionTask(execution),
  };

  return secureJson(response);
}
