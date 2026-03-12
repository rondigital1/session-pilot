import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRequest } from "./helpers/request";

const {
  createExecutionTaskRecordMock,
  executionStartMock,
  getLatestAnalysisRunForRepositoryMock,
  getRepositoryMock,
  getSuggestionMock,
  randomUuidMock,
} = vi.hoisted(() => ({
  createExecutionTaskRecordMock: vi.fn(),
  executionStartMock: vi.fn(),
  getLatestAnalysisRunForRepositoryMock: vi.fn(),
  getRepositoryMock: vi.fn(),
  getSuggestionMock: vi.fn(),
  randomUuidMock: vi.fn(() => "uuid-execution"),
}));

vi.mock("@/server/db/queries", () => ({
  createExecutionTaskRecord: createExecutionTaskRecordMock,
  getLatestAnalysisRunForRepository: getLatestAnalysisRunForRepositoryMock,
  getRepository: getRepositoryMock,
  getSuggestion: getSuggestionMock,
}));

vi.mock("@/server/execution/executionOrchestrator", () => ({
  executionOrchestrator: {
    start: executionStartMock,
  },
}));

vi.mock("crypto", () => ({
  randomUUID: randomUuidMock,
}));

import { POST } from "@/app/api/executions/route";

describe("POST /api/executions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates an execution record and starts the orchestrator for the MVP happy path", async () => {
    getSuggestionMock.mockResolvedValue({
      id: "suggestion_1",
      repositoryId: "repo_1",
      analysisRunId: "analysis_1",
      title: "Cover execution creation route",
      category: "testing",
      summary: "Add route coverage for execution creation.",
      evidenceJson: JSON.stringify([
        {
          label: "Gap",
          detail: "The create execution route is not covered by tests.",
          filePath: "app/api/executions/route.ts",
        },
      ]),
      impactScore: 8,
      effortScore: 3,
      confidenceScore: 9,
      riskScore: 2,
      priorityScore: 15,
      autonomyMode: "safe_auto",
      likelyFilesJson: JSON.stringify([
        "app/api/executions/route.ts",
        "tests/executionsRoute.test.ts",
      ]),
      createdAt: new Date("2026-03-11T12:00:00.000Z"),
    });
    getRepositoryMock.mockResolvedValue({
      id: "repo_1",
      rootId: "root_1",
      name: "session-pilot",
      path: "/repos/session-pilot",
      remoteOrigin: "git@github.com:ron/session-pilot.git",
      defaultBranch: "main",
      currentBranch: "codex/pivot",
      isDirty: false,
      fingerprintHash: null,
      profileJson: null,
      lastAnalyzedAt: new Date("2026-03-11T11:59:00.000Z"),
      createdAt: new Date("2026-03-11T11:00:00.000Z"),
      updatedAt: new Date("2026-03-11T12:00:00.000Z"),
    });
    getLatestAnalysisRunForRepositoryMock.mockResolvedValue({
      id: "analysis_1",
      repositoryId: "repo_1",
      status: "completed",
      fingerprintHash: "hash_1",
      profileJson: JSON.stringify({
        repositoryId: "repo_1",
        repoName: "session-pilot",
        repoPath: "/repos/session-pilot",
        packageManager: "npm",
        languages: ["typescript"],
        frameworks: ["nextjs", "react"],
        scripts: ["test", "build"],
        stackTags: ["nextjs", "react", "typescript"],
        validationCommands: [["npm", "test"], ["npm", "run", "build"]],
        defaultBranch: "main",
        currentBranch: "codex/pivot",
        remoteOrigin: "git@github.com:ron/session-pilot.git",
        isDirty: false,
        hasReadme: true,
        hasEnvExample: true,
        hasCi: true,
        hasLint: true,
        hasTests: true,
        hasTypecheck: true,
        typecheckStrict: true,
        ciProvider: "github_actions",
        testRunner: "vitest",
        lintTool: "eslint",
        lineCount: 1500,
        fileCount: 80,
      }),
      findingsJson: JSON.stringify([]),
      summary: "summary",
      error: null,
      createdAt: new Date("2026-03-11T12:00:00.000Z"),
      completedAt: new Date("2026-03-11T12:01:00.000Z"),
    });
    createExecutionTaskRecordMock.mockImplementation(async (payload: any) => payload);

    const response = await POST(
      createApiRequest("/api/executions", {
        method: "POST",
        body: {
          suggestionId: "suggestion_1",
          providerId: "codex-cli",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(createExecutionTaskRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "execution_uuid-execution",
        repositoryId: "repo_1",
        suggestionId: "suggestion_1",
        providerId: "codex-cli",
        status: "queued",
        taskSpecJson: expect.any(String),
        validationCommandsJson: expect.any(String),
        agentPrompt: expect.stringContaining("Execution provider: codex-cli"),
      })
    );
    expect(executionStartMock).toHaveBeenCalledWith("execution_uuid-execution");

    const payload = await response.json();
    expect(payload).toMatchObject({
      execution: {
        id: "execution_uuid-execution",
        repositoryId: "repo_1",
        suggestionId: "suggestion_1",
        providerId: "codex-cli",
        status: "queued",
        validationCommands: [["npm", "test"], ["npm", "run", "build"]],
      },
    });
  });

  it("rejects unsupported execution providers", async () => {
    const response = await POST(
      createApiRequest("/api/executions", {
        method: "POST",
        body: {
          suggestionId: "suggestion_1",
          providerId: "openhands",
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid input: expected \"codex-cli\"",
    });
    expect(getSuggestionMock).not.toHaveBeenCalled();
    expect(createExecutionTaskRecordMock).not.toHaveBeenCalled();
    expect(executionStartMock).not.toHaveBeenCalled();
  });
});
