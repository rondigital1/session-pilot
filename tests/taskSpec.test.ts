import { describe, expect, it } from "vitest";
import { buildTaskSpec } from "@/server/tasks/taskSpecService";
import type {
  RepoAnalysisResult,
  RepositoryInventoryItem,
  SuggestionRecord,
} from "@/server/types/domain";

describe("buildTaskSpec", () => {
  it("produces an execution-grade task spec from a ranked suggestion", () => {
    const repository: RepositoryInventoryItem = {
      id: "repo_1",
      rootId: "root_1",
      name: "alpha",
      path: "/repos/alpha",
      remoteOrigin: null,
      defaultBranch: "main",
      currentBranch: "feature/task",
      isDirty: false,
      lastAnalyzedAt: null,
      lastAnalysisRunId: "analysis_1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const analysis: RepoAnalysisResult = {
      id: "analysis_1",
      repositoryId: "repo_1",
      status: "completed",
      profile: {
        repositoryId: "repo_1",
        repoName: "alpha",
        repoPath: "/repos/alpha",
        packageManager: "npm",
        languages: ["typescript"],
        frameworks: ["nextjs"],
        scripts: ["lint", "test"],
        stackTags: ["nextjs", "typescript"],
        validationCommands: [["npm", "run", "lint"], ["npm", "run", "test"]],
        defaultBranch: "main",
        currentBranch: "feature/task",
        remoteOrigin: null,
        isDirty: false,
        hasReadme: true,
        hasEnvExample: true,
        hasCi: true,
        hasLint: true,
        hasTests: true,
        hasTypecheck: true,
        typecheckStrict: true,
        ciProvider: "detected",
        testRunner: "vitest",
        lintTool: "eslint",
        lineCount: 1200,
        fileCount: 45,
      },
      findings: [],
      summary: "summary",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null,
    };
    const suggestion: SuggestionRecord = {
      id: "suggestion_1",
      repositoryId: "repo_1",
      analysisRunId: "analysis_1",
      title: "Refactor oversized module hotspot",
      category: "architecture",
      summary: "Split the largest module into smaller units.",
      evidence: [
        { label: "Largest file", detail: "src/app.tsx is 500 lines.", filePath: "src/app.tsx" },
      ],
      impactScore: 8,
      effortScore: 7,
      confidenceScore: 8,
      riskScore: 6,
      priorityScore: 10.5,
      autonomyMode: "manual_review",
      likelyFiles: ["src/app.tsx"],
      createdAt: new Date().toISOString(),
    };

    const taskSpec = buildTaskSpec(repository, analysis, suggestion);

    expect(taskSpec.title).toBe("Refactor oversized module hotspot");
    expect(taskSpec.likelyFiles).toContain("src/app.tsx");
    expect(taskSpec.validationCommands).toHaveLength(2);
    expect(taskSpec.implementationPlan.length).toBeGreaterThan(2);
  });
});
