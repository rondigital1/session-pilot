import type {
  ExecutionEventRecord,
  ExecutionTaskRecord,
  RepoAnalysisResult,
  RepoProfile,
  RepositoryInventoryItem,
  RepoRootRecord,
  SuggestionRecord,
  TaskSpec,
  ValidationCommandResult,
} from "@/server/types/domain";
import type {
  AnalysisRun,
  ExecutionEvent,
  ExecutionTask,
  RepoRoot,
  Repository,
  Suggestion,
} from "@/server/db/schema";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeRepoRoot(row: RepoRoot): RepoRootRecord {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeRepository(
  row: Repository,
  options?: { lastAnalysisRunId?: string | null }
): RepositoryInventoryItem {
  return {
    id: row.id,
    rootId: row.rootId,
    name: row.name,
    path: row.path,
    remoteOrigin: row.remoteOrigin,
    defaultBranch: row.defaultBranch,
    currentBranch: row.currentBranch,
    isDirty: Boolean(row.isDirty),
    lastAnalyzedAt: row.lastAnalyzedAt ? row.lastAnalyzedAt.toISOString() : null,
    lastAnalysisRunId: options?.lastAnalysisRunId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeAnalysisRun(row: AnalysisRun): RepoAnalysisResult {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    status: row.status,
    profile: parseJson<RepoProfile>(row.profileJson, {} as RepoProfile),
    findings: parseJson(row.findingsJson, []),
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    error: row.error,
  };
}

export function serializeSuggestion(row: Suggestion): SuggestionRecord {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    analysisRunId: row.analysisRunId,
    title: row.title,
    category: row.category as SuggestionRecord["category"],
    summary: row.summary,
    evidence: parseJson(row.evidenceJson, []),
    impactScore: row.impactScore,
    effortScore: row.effortScore,
    confidenceScore: row.confidenceScore,
    riskScore: row.riskScore,
    priorityScore: row.priorityScore,
    autonomyMode: row.autonomyMode as SuggestionRecord["autonomyMode"],
    likelyFiles: parseJson(row.likelyFilesJson, []),
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeExecutionTask(row: ExecutionTask): ExecutionTaskRecord {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    suggestionId: row.suggestionId,
    providerId: row.providerId as ExecutionTaskRecord["providerId"],
    status: row.status,
    branchName: row.branchName,
    worktreePath: row.worktreePath,
    taskSpec: parseJson<TaskSpec>(row.taskSpecJson, {} as TaskSpec),
    agentPrompt: row.agentPrompt,
    validationCommands: parseJson<string[][]>(row.validationCommandsJson, []),
    validationResults: parseJson<ValidationCommandResult[]>(row.validationResultsJson, []),
    finalMessage: row.finalMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    error: row.error,
  };
}

export function serializeExecutionEvent(row: ExecutionEvent): ExecutionEventRecord {
  const parsed = parseJson<{ timestamp?: string; data?: unknown }>(row.eventData, {});

  return {
    id: row.id,
    executionTaskId: row.executionTaskId,
    type: row.eventType as ExecutionEventRecord["type"],
    timestamp: parsed.timestamp ?? row.createdAt.toISOString(),
    data: parsed.data,
  };
}
