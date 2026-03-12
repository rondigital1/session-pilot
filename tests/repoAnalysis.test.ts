import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRepositoryMock,
  createAnalysisRunMock,
  updateAnalysisRunMock,
  updateRepositoryMock,
  storeSuggestionsMock,
  fingerprintRepositoryMock,
} = vi.hoisted(() => ({
  getRepositoryMock: vi.fn(),
  createAnalysisRunMock: vi.fn(),
  updateAnalysisRunMock: vi.fn(),
  updateRepositoryMock: vi.fn(),
  storeSuggestionsMock: vi.fn(),
  fingerprintRepositoryMock: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getRepository: getRepositoryMock,
  createAnalysisRun: createAnalysisRunMock,
  updateAnalysisRun: updateAnalysisRunMock,
  updateRepository: updateRepositoryMock,
  storeSuggestions: storeSuggestionsMock,
}));

vi.mock("@/server/repos/repoFingerprintService", () => ({
  fingerprintRepository: fingerprintRepositoryMock,
}));

import { analyzeRepository } from "@/server/repos/repoAnalysisService";

function createRepositoryRow() {
  return {
    id: "repo_1",
    rootId: "root_1",
    name: "alpha",
    path: "/repos/alpha",
    remoteOrigin: null,
    defaultBranch: "main",
    currentBranch: "feature/test",
    isDirty: false,
    fingerprintHash: null,
    profileJson: null,
    lastAnalyzedAt: null,
    createdAt: new Date("2026-03-11T12:00:00.000Z"),
    updatedAt: new Date("2026-03-11T12:00:00.000Z"),
  };
}

function createInspection(overrides: Record<string, unknown> = {}) {
  return {
    profile: {
      repositoryId: "repo_1",
      repoName: "alpha",
      repoPath: "/repos/alpha",
      packageManager: "npm" as const,
      languages: ["typescript"],
      frameworks: ["nextjs", "react"],
      scripts: ["build"],
      stackTags: ["nextjs", "react", "typescript"],
      validationCommands: [],
      defaultBranch: "main",
      currentBranch: "feature/test",
      remoteOrigin: null,
      isDirty: false,
      hasReadme: true,
      hasEnvExample: false,
      hasCi: false,
      hasLint: false,
      hasTests: false,
      hasTypecheck: true,
      typecheckStrict: false,
      ciProvider: null,
      testRunner: null,
      lintTool: null,
      lineCount: 900,
      fileCount: 18,
    },
    fingerprintHash: "hash_1",
    largestFiles: [{ path: "app/page.tsx", lines: 540 }],
    todoHotspots: [{ path: "app/page.tsx", count: 4 }],
    manifestFiles: ["package.json"],
    readmeFiles: ["README.md"],
    envExampleFiles: [],
    envLocalFiles: [".env"],
    ciFiles: [],
    lintConfigFiles: [],
    typecheckConfigFiles: ["tsconfig.json"],
    testFiles: [],
    entryFiles: ["app/page.tsx"],
    envUsageFiles: ["app/page.tsx"],
    ...overrides,
  };
}

describe("analyzeRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getRepositoryMock.mockResolvedValue(createRepositoryRow());
    createAnalysisRunMock.mockResolvedValue(undefined);
    updateRepositoryMock.mockResolvedValue(undefined);
    updateAnalysisRunMock.mockImplementation(async (id: string, data: Record<string, unknown>) => ({
      id,
      repositoryId: "repo_1",
      status: data.status ?? "completed",
      fingerprintHash: "hash_1",
      profileJson: (data.profileJson as string) ?? JSON.stringify({}),
      findingsJson: (data.findingsJson as string) ?? JSON.stringify([]),
      summary: (data.summary as string) ?? "summary",
      error: null,
      createdAt: new Date("2026-03-11T12:00:00.000Z"),
      completedAt: (data.completedAt as Date) ?? new Date("2026-03-11T12:02:00.000Z"),
    }));
    storeSuggestionsMock.mockImplementation(async (rows: Array<Record<string, unknown>>) => rows);
  });

  it("builds grounded suggestions with file-backed evidence and bounded likely files", async () => {
    fingerprintRepositoryMock.mockResolvedValue(createInspection());

    const result = await analyzeRepository("repo_1");

    const validationSuggestion = result.suggestions[0];
    const testingSuggestion = result.suggestions.find(
      (suggestion) => suggestion.title === "Add a bounded automated test path"
    );
    const envSuggestion = result.suggestions.find(
      (suggestion) => suggestion.title === "Check in an environment template"
    );

    expect(createAnalysisRunMock).toHaveBeenCalledTimes(1);
    expect(updateRepositoryMock).toHaveBeenCalledTimes(1);
    expect(result.analysis.status).toBe("completed");
    expect(validationSuggestion.title).toBe("Define explicit validation commands");
    expect(
      result.suggestions.some((suggestion) => suggestion.title === "Add a minimal CI workflow")
    ).toBe(false);
    expect(testingSuggestion?.summary).toContain("app/page.tsx");
    expect(testingSuggestion?.likelyFiles).toEqual(["package.json", "app/page.tsx"]);
    expect(testingSuggestion?.evidence.some((item) => item.filePath === "app/page.tsx")).toBe(true);
    expect(envSuggestion?.likelyFiles).toEqual([".env.example", "app/page.tsx", "README.md"]);
    expect(envSuggestion?.evidence.some((item) => item.filePath === "app/page.tsx")).toBe(true);
    expect(result.suggestions.every((suggestion) => suggestion.likelyFiles.length <= 3)).toBe(true);
  });

  it("suppresses JS-specific lint findings for non-JS repos and only adds CI when commands exist", async () => {
    fingerprintRepositoryMock.mockResolvedValue(
      createInspection({
        profile: {
          repositoryId: "repo_1",
          repoName: "alpha",
          repoPath: "/repos/alpha",
          packageManager: "unknown",
          languages: ["go"],
          frameworks: [],
          scripts: [],
          stackTags: ["go"],
          validationCommands: [["go", "test", "./..."]],
          defaultBranch: "main",
          currentBranch: "feature/test",
          remoteOrigin: null,
          isDirty: false,
          hasReadme: true,
          hasEnvExample: true,
          hasCi: false,
          hasLint: false,
          hasTests: true,
          hasTypecheck: false,
          typecheckStrict: false,
          ciProvider: null,
          testRunner: null,
          lintTool: null,
          lineCount: 420,
          fileCount: 8,
        },
        manifestFiles: [],
        readmeFiles: ["README.md"],
        envExampleFiles: [".env.example"],
        envLocalFiles: [],
        largestFiles: [{ path: "cmd/api/main.go", lines: 220 }],
        todoHotspots: [],
        typecheckConfigFiles: [],
        entryFiles: ["cmd/api/main.go"],
        envUsageFiles: [],
      })
    );

    const result = await analyzeRepository("repo_1");

    expect(result.suggestions.some((suggestion) => suggestion.title === "Add a repo lint command")).toBe(
      false
    );
    const ciSuggestion = result.suggestions.find(
      (suggestion) => suggestion.title === "Add a minimal CI workflow"
    );

    expect(ciSuggestion?.likelyFiles).toEqual([".github/workflows/ci.yml"]);
    expect(result.suggestions.some((suggestion) => suggestion.title === "Define explicit validation commands")).toBe(
      false
    );
  });
});
