/**
 * Centralized API route constants
 *
 * Use these instead of hardcoding paths in components.
 */
export const API = {
  health: "/api/health",
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
