import { NextRequest } from "next/server";
import {
  getExecutionTaskRecord,
  getRepository,
  getSuggestion,
} from "@/server/db/queries";
import {
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
  const execution = await getExecutionTaskRecord(id);
  if (!execution) {
    return secureError("Execution not found", 404);
  }

  const repository = await getRepository(execution.repositoryId);
  const suggestion = await getSuggestion(execution.suggestionId);

  return secureJson({
    execution: serializeExecutionTask(execution),
    repository: repository ? serializeRepository(repository) : null,
    suggestion: suggestion ? serializeSuggestion(suggestion) : null,
  });
}
