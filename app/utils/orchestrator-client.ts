"use client";

import { API } from "@/app/utils/api-routes";
import type {
  AnalyzeRepositoryResponse,
  CancelExecutionResponse,
  CreateExecutionRequest,
  CreateExecutionResponse,
  CreateRepoRootRequest,
  ExecutionDetailResponse,
  ExecutionProviderId,
  RepoRootRecord,
  RepositoryDetailResponse,
  RepositoryInventoryItem,
  RepositoryListResponse,
  SuggestionDetailResponse,
  SuggestionTaskResponse,
} from "@/server/types/domain";

export const CODEX_PROVIDER = {
  id: "codex-cli" as ExecutionProviderId,
  label: "Codex CLI",
} as const;

export const orchestratorQueryKeys = {
  repoRoots: () => ["repo-roots"] as const,
  repositories: () => ["repositories"] as const,
  repository: (repositoryId: string) => ["repository", repositoryId] as const,
  suggestion: (suggestionId: string) => ["suggestion", suggestionId] as const,
  suggestionTask: (suggestionId: string) => ["suggestion-task", suggestionId] as const,
  execution: (executionId: string) => ["execution", executionId] as const,
} as const;

type ErrorPayload = {
  error?: string;
  details?: string[];
  message?: string;
};

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: init?.method && init.method !== "GET" ? undefined : "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const errorPayload = payload as ErrorPayload | null;
    throw new Error(
      errorPayload?.error ?? errorPayload?.message ?? `Request failed (${response.status})`
    );
  }

  return payload as T;
}

export async function fetchRepoRoots(): Promise<RepoRootRecord[]> {
  const payload = await requestJson<{ roots: RepoRootRecord[] }>(API.repoRoots);
  return payload.roots;
}

export async function createRepoRoot(payload: CreateRepoRootRequest): Promise<RepoRootRecord> {
  const response = await requestJson<{ root: RepoRootRecord }>(API.repoRoots, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.root;
}

export async function deleteRepoRoot(rootId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`${API.repoRoots}?id=${encodeURIComponent(rootId)}`, {
    method: "DELETE",
  });
}

export async function fetchRepositories(): Promise<RepositoryInventoryItem[]> {
  const payload = await requestJson<RepositoryListResponse>(API.repositories);
  return payload.repositories;
}

export async function triggerDiscovery(): Promise<RepositoryInventoryItem[]> {
  const payload = await requestJson<RepositoryListResponse>(API.repositoryDiscover, {
    method: "POST",
  });
  return payload.repositories;
}

export async function fetchRepositoryDetail(
  repositoryId: string
): Promise<RepositoryDetailResponse> {
  return requestJson<RepositoryDetailResponse>(API.repository(repositoryId));
}

export async function triggerAnalysis(repositoryId: string): Promise<RepositoryDetailResponse> {
  const payload = await requestJson<AnalyzeRepositoryResponse>(API.repositoryAnalyze(repositoryId), {
    method: "POST",
  });

  return {
    repository: payload.repository,
    analysis: payload.analysis,
    suggestions: payload.suggestions,
    executions: [],
  };
}

export async function fetchSuggestion(suggestionId: string): Promise<SuggestionDetailResponse> {
  return requestJson<SuggestionDetailResponse>(API.suggestion(suggestionId));
}

export async function fetchTaskBundle(
  suggestionId: string,
  providerId = CODEX_PROVIDER.id
): Promise<SuggestionTaskResponse> {
  return requestJson<SuggestionTaskResponse>(API.suggestionTask(suggestionId, providerId));
}

export async function createExecution(
  suggestionId: string
): Promise<CreateExecutionResponse["execution"]> {
  const request: CreateExecutionRequest = {
    suggestionId,
    providerId: CODEX_PROVIDER.id,
  };
  const payload = await requestJson<CreateExecutionResponse>(API.executions, {
    method: "POST",
    body: JSON.stringify(request),
  });

  return payload.execution;
}

export async function fetchRun(runId: string): Promise<ExecutionDetailResponse> {
  return requestJson<ExecutionDetailResponse>(API.execution(runId));
}

export async function cancelRun(runId: string): Promise<CancelExecutionResponse> {
  return requestJson<CancelExecutionResponse>(API.executionCancel(runId), {
    method: "POST",
  });
}
