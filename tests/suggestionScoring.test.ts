import { describe, expect, it } from "vitest";
import { scoreSuggestionsFromAnalysis } from "@/server/suggestions/suggestionScoringService";
import type { RepoAnalysisResult, RepoFinding } from "@/server/types/domain";

function createFinding(overrides: Partial<RepoFinding>): RepoFinding {
  return {
    id: "finding_1",
    category: "workflow",
    severity: "warning",
    title: "Missing deterministic validation commands",
    summary: "summary",
    evidence: [
      { label: "Scripts", detail: "No scripts detected.", filePath: "package.json" },
      { label: "Primary code path", detail: "app/page.tsx is uncovered.", filePath: "app/page.tsx" },
    ],
    likelyFiles: ["package.json", "app/page.tsx"],
    ...overrides,
  };
}

function createAnalysis(findings: RepoFinding[]): RepoAnalysisResult {
  return {
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
      scripts: ["build"],
      stackTags: ["nextjs", "typescript"],
      validationCommands: [],
      defaultBranch: "main",
      currentBranch: "main",
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
      lineCount: 1400,
      fileCount: 45,
    },
    findings,
    summary: "summary",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: null,
  };
}

describe("scoreSuggestionsFromAnalysis", () => {
  it("ranks bounded execution-critical work ahead of broad architecture cleanup", () => {
    const analysis = createAnalysis([
      createFinding({ id: "finding_validation" }),
      createFinding({
        id: "finding_large_file",
        category: "architecture",
        title: "Large file hotspot",
        summary: "summary",
        likelyFiles: ["src/mega-module.ts"],
        evidence: [
          {
            label: "Largest file",
            detail: "src/mega-module.ts is 720 lines.",
            filePath: "src/mega-module.ts",
          },
        ],
      }),
      createFinding({
        id: "finding_dirty",
        category: "workflow",
        severity: "info",
        title: "Dirty repo checkout",
        likelyFiles: [],
        evidence: [{ label: "Git status", detail: "Working tree is dirty." }],
      }),
    ]);

    const suggestions = scoreSuggestionsFromAnalysis(analysis);

    expect(suggestions[0].title).toBe("Define explicit validation commands");
    expect(suggestions[0].priorityScore).toBeGreaterThan(suggestions[1].priorityScore);
    expect(suggestions[1].title).toBe("Refactor the largest module hotspot");
    expect(suggestions[2].title).toBe("Stabilize the working tree before execution");
  });

  it("rewards file-backed evidence and bounded likely files while deduplicating output", () => {
    const analysis = createAnalysis([
      createFinding({
        id: "finding_bounded",
        title: "Missing automated test coverage",
        category: "testing",
        severity: "critical",
        likelyFiles: ["package.json", "app/page.tsx", "package.json"],
        evidence: [
          { label: "Validation plan", detail: "No test command.", filePath: "package.json" },
          { label: "Validation plan", detail: "No test command.", filePath: "package.json" },
          { label: "Primary target", detail: "app/page.tsx is the main entry.", filePath: "app/page.tsx" },
        ],
      }),
      createFinding({
        id: "finding_broad",
        title: "Missing automated test coverage",
        category: "testing",
        severity: "critical",
        likelyFiles: ["package.json", "app/page.tsx", "src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts"],
        evidence: [{ label: "Validation plan", detail: "No test command." }],
      }),
    ]);

    const suggestions = scoreSuggestionsFromAnalysis(analysis);
    const bounded = suggestions[0];
    const broad = suggestions[1];

    expect(bounded.title).toBe("Add a bounded automated test path");
    expect(bounded.confidenceScore).toBeGreaterThan(broad.confidenceScore);
    expect(bounded.priorityScore).toBeGreaterThan(broad.priorityScore);
    expect(bounded.likelyFiles).toEqual(["package.json", "app/page.tsx"]);
    expect(bounded.evidence).toHaveLength(2);
  });
});
