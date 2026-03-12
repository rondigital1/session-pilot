import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRequest } from "./helpers/request";

const {
  getLatestAnalysisRunForRepositoryMock,
  getRepositoryMock,
  getSuggestionMock,
} = vi.hoisted(() => ({
  getLatestAnalysisRunForRepositoryMock: vi.fn(),
  getRepositoryMock: vi.fn(),
  getSuggestionMock: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getLatestAnalysisRunForRepository: getLatestAnalysisRunForRepositoryMock,
  getRepository: getRepositoryMock,
  getSuggestion: getSuggestionMock,
}));

import { GET } from "@/app/api/suggestions/[id]/task/route";

describe("GET /api/suggestions/[id]/task", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the happy-path task bundle for the Codex provider", async () => {
    getSuggestionMock.mockResolvedValue({
      id: "suggestion_1",
      repositoryId: "repo_1",
      analysisRunId: "analysis_1",
      title: "Add deterministic validation coverage",
      category: "testing",
      summary: "Add and wire test coverage for the MVP flow.",
      evidenceJson: JSON.stringify([
        {
          label: "Current gap",
          detail: "No route coverage exists for execution creation.",
          filePath: "tests",
        },
      ]),
      impactScore: 9,
      effortScore: 4,
      confidenceScore: 8,
      riskScore: 3,
      priorityScore: 14,
      autonomyMode: "safe_auto",
      likelyFilesJson: JSON.stringify([
        "tests/executionsRoute.test.ts",
        "app/api/executions/route.ts",
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
      fingerprintHash: "hash_1",
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
        hasCi: false,
        hasLint: false,
        hasTests: true,
        hasTypecheck: true,
        typecheckStrict: true,
        ciProvider: null,
        testRunner: "vitest",
        lintTool: null,
        lineCount: 1500,
        fileCount: 80,
      }),
      findingsJson: JSON.stringify([]),
      summary: "summary",
      error: null,
      createdAt: new Date("2026-03-11T12:00:00.000Z"),
      completedAt: new Date("2026-03-11T12:01:00.000Z"),
    });

    const response = await GET(
      createApiRequest("/api/suggestions/suggestion_1/task?providerId=codex-cli"),
      { params: Promise.resolve({ id: "suggestion_1" }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      suggestion: {
        id: "suggestion_1",
        title: "Add deterministic validation coverage",
      },
      repository: {
        id: "repo_1",
        name: "session-pilot",
      },
      taskSpec: {
        suggestionId: "suggestion_1",
        repositoryId: "repo_1",
        title: "Add deterministic validation coverage",
        likelyFiles: [
          "tests/executionsRoute.test.ts",
          "app/api/executions/route.ts",
        ],
        validationCommands: [["npm", "test"], ["npm", "run", "build"]],
      },
      prompt: {
        providerId: "codex-cli",
      },
    });

    expect(payload.prompt.prompt).toContain("Execution provider: codex-cli");
    expect(payload.prompt.prompt).toContain(
      "Implement add deterministic validation coverage in session-pilot"
    );
  });

  it("rejects unsupported provider IDs before building the task bundle", async () => {
    const response = await GET(
      createApiRequest("/api/suggestions/suggestion_1/task?providerId=openhands"),
      { params: Promise.resolve({ id: "suggestion_1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unsupported providerId",
    });
    expect(getSuggestionMock).not.toHaveBeenCalled();
    expect(getRepositoryMock).not.toHaveBeenCalled();
    expect(getLatestAnalysisRunForRepositoryMock).not.toHaveBeenCalled();
  });
});
