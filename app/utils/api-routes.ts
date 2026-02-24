/**
 * Centralized API route constants
 *
 * Use these instead of hardcoding paths in components.
 */
export const API = {
  workspaces: "/api/workspaces",
  workspaceScan: "/api/workspaces/scan",
  workspace: (id: string) => `/api/workspaces/${id}`,
  sessionStart: "/api/session/start",
  sessionTask: (id: string) => `/api/session/${id}/task`,
  sessionTaskChecklist: (id: string) => `/api/session/${id}/task/checklist`,
  sessionEnd: (id: string) => `/api/session/${id}/end`,
  sessionCancel: (id: string) => `/api/session/${id}/cancel`,
  sessionEvents: (id: string) => `/api/session/${id}/events`,
} as const;
