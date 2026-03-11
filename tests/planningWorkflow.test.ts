import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  scanLocalRepositoryMock,
  scanGitHubRepositoryMock,
  parseGitHubRepoMock,
  storeSignalsMock,
  createSessionTasksBulkMock,
  updateSessionStatusMock,
  generateSessionPlanMock,
  emitSessionEventMock,
  completeSessionMock,
} = vi.hoisted(() => ({
  scanLocalRepositoryMock: vi.fn(),
  scanGitHubRepositoryMock: vi.fn(),
  parseGitHubRepoMock: vi.fn(),
  storeSignalsMock: vi.fn(),
  createSessionTasksBulkMock: vi.fn(),
  updateSessionStatusMock: vi.fn(),
  generateSessionPlanMock: vi.fn(),
  emitSessionEventMock: vi.fn(),
  completeSessionMock: vi.fn(),
}));

vi.mock("@/server/scanners/localScan", () => ({
  scanLocalRepository: scanLocalRepositoryMock,
}));

vi.mock("@/server/scanners/githubScan", () => ({
  scanGitHubRepository: scanGitHubRepositoryMock,
  parseGitHubRepo: parseGitHubRepoMock,
}));

vi.mock("@/server/db/queries", () => ({
  storeSignals: storeSignalsMock,
  createSessionTasksBulk: createSessionTasksBulkMock,
  updateSessionStatus: updateSessionStatusMock,
}));

vi.mock("@/server/agent/sessionPlanner", () => ({
  generateSessionPlan: generateSessionPlanMock,
}));

vi.mock("@/lib/session/events", () => ({
  emitSessionEvent: emitSessionEventMock,
  completeSession: completeSessionMock,
}));

import { runPlanningWorkflow } from "@/server/agent/planningWorkflow";

describe("runPlanningWorkflow", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    scanLocalRepositoryMock.mockResolvedValue({
      signals: [],
      scannedFiles: 0,
      errors: [],
    });
    scanGitHubRepositoryMock.mockResolvedValue({
      signals: [],
      rateLimitRemaining: 100,
      errors: [],
    });
    parseGitHubRepoMock.mockReturnValue({
      owner: "ron",
      repo: "session-pilot",
    });
    generateSessionPlanMock.mockResolvedValue([
      {
        title: "Review top signal",
        description: "Use the strongest signal to shape the session.",
        estimatedMinutes: 30,
        relatedSignals: [],
        order: 0,
      },
    ]);
    createSessionTasksBulkMock.mockImplementation(async (tasks) => tasks);
    updateSessionStatusMock.mockResolvedValue(undefined);
    emitSessionEventMock.mockResolvedValue(undefined);
    completeSessionMock.mockResolvedValue(undefined);
    storeSignalsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses GitHub only for remote-only context when local repo signals exist", async () => {
    await runPlanningWorkflow({
      sessionId: "sess_local",
      workspace: {
        id: "ws_local",
        name: "SessionPilot",
        localPath: process.cwd(),
        githubRepo: "ron/session-pilot",
      } as any,
      userGoal: "Tighten session startup",
      timeBudgetMinutes: 60,
      focusWeights: {
        bugs: 0.5,
        features: 0.3,
        refactor: 0.7,
      },
    });

    expect(scanLocalRepositoryMock).toHaveBeenCalledWith({
      workspacePath: process.cwd(),
      sessionId: "sess_local",
    });
    expect(scanGitHubRepositoryMock).toHaveBeenCalledWith({
      owner: "ron",
      repo: "session-pilot",
      sessionId: "sess_local",
      includeIssues: true,
      includePRs: false,
      includePRComments: false,
      includeRecentCommits: false,
      maxIssues: 5,
      maxPRs: undefined,
      maxPRComments: undefined,
    });
  });

  it("keeps the broader GitHub scan for GitHub-only workspaces", async () => {
    await runPlanningWorkflow({
      sessionId: "sess_remote",
      workspace: {
        id: "ws_remote",
        name: "SessionPilot",
        localPath: null,
        githubRepo: "ron/session-pilot",
      } as any,
      userGoal: "Review remote repo state",
      timeBudgetMinutes: 45,
      focusWeights: {
        bugs: 0.4,
        features: 0.4,
        refactor: 0.2,
      },
    });

    expect(scanLocalRepositoryMock).not.toHaveBeenCalled();
    expect(scanGitHubRepositoryMock).toHaveBeenCalledWith({
      owner: "ron",
      repo: "session-pilot",
      sessionId: "sess_remote",
      includeIssues: true,
      includePRs: true,
      includePRComments: true,
      includeRecentCommits: true,
      maxIssues: 10,
      maxPRs: 5,
      maxPRComments: 10,
    });
  });
});
