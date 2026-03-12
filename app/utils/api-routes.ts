/**
 * Centralized API route constants
 *
 * Use these instead of hardcoding paths in components.
 */
export const API = {
  health: "/api/health",
  repoRoots: "/api/repo-roots",
  repositories: "/api/repositories",
  repositoryDiscover: "/api/repositories/discover",
  repository: (id: string) => `/api/repositories/${id}`,
  repositoryAnalyze: (id: string) => `/api/repositories/${id}/analyze`,
  suggestions: "/api/suggestions",
  suggestion: (id: string) => `/api/suggestions/${id}`,
  suggestionTask: (id: string, providerId = "codex-cli") =>
    `/api/suggestions/${id}/task?providerId=${encodeURIComponent(providerId)}`,
  executions: "/api/executions",
  execution: (id: string) => `/api/executions/${id}`,
  executionCancel: (id: string) => `/api/executions/${id}/cancel`,
  executionEvents: (id: string) => `/api/executions/${id}/events`,
  workspaces: "/api/workspaces",
  workspaceScan: "/api/workspaces/scan",
  workspace: (id: string) => `/api/workspaces/${id}`,
  workspaceSessions: (id: string) => `/api/workspaces/${id}/sessions`,
  sessionStart: "/api/session/start",
  session: (id: string) => `/api/session/${id}`,
  sessionTask: (id: string) => `/api/session/${id}/task`,
  sessionTaskChecklist: (id: string) => `/api/session/${id}/task/checklist`,
  sessionEnd: (id: string) => `/api/session/${id}/end`,
  sessionCancel: (id: string) => `/api/session/${id}/cancel`,
  sessionEvents: (id: string) => `/api/session/${id}/events`,
} as const;

export const APP_ROUTES = {
  inventory: "/",
  repository: (id: string) => `/repos/${id}`,
  suggestion: (id: string) => `/suggestions/${id}`,
  run: (id: string) => `/runs/${id}`,
} as const;
