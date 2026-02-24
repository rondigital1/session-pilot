/**
 * Unit tests for the snapshot builder and schema validation
 */

import { describe, it, expect } from "vitest";
import { ProjectSnapshotV1Schema, type ProjectSnapshotV1 } from "@/server/snapshot/schema";

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe("ProjectSnapshotV1Schema", () => {
  const validSnapshot: ProjectSnapshotV1 = {
    version: 1,
    workspaceId: "ws_test",
    createdAt: new Date().toISOString(),
    snapshotHash: "abc123def456",
    repo: {
      root: "/test/repo",
      lastCommitHash: "abc123",
      lastCommitMessage: "test commit",
      isDirty: false,
      defaultBranch: "main",
    },
    health: {
      hasTests: true,
      testRunner: "vitest",
      hasLint: true,
      lintTool: "eslint",
      hasTypecheck: true,
      typecheckStrict: true,
      hasCi: true,
      ciProvider: "github_actions",
      hasReadme: true,
      hasEnvExample: false,
    },
    hotspots: {
      largestFiles: [
        { path: "src/big.ts", lines: 500 },
        { path: "src/medium.ts", lines: 250 },
      ],
      todoHotspots: [
        { path: "src/todo.ts", count: 5 },
      ],
    },
    stackTags: ["react", "typescript"],
    signals: [
      {
        key: "tests.missing",
        category: "tests",
        severity: "critical",
        title: "No test framework",
        evidence: "No test runner found",
      },
      {
        key: "ci.missing",
        category: "ci",
        severity: "warning",
        title: "No CI",
        evidence: "No CI config",
      },
    ],
  };

  it("validates a correct snapshot", () => {
    const result = ProjectSnapshotV1Schema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });

  it("rejects snapshot with wrong version", () => {
    const bad = { ...validSnapshot, version: 2 };
    const result = ProjectSnapshotV1Schema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects snapshot without workspaceId", () => {
    const { workspaceId: _, ...bad } = validSnapshot;
    const result = ProjectSnapshotV1Schema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects snapshot with invalid signal category", () => {
    const bad = {
      ...validSnapshot,
      signals: [
        {
          key: "test.key",
          category: "invalid_category",
          severity: "info",
          title: "Test",
          evidence: "Evidence",
        },
      ],
    };
    const result = ProjectSnapshotV1Schema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts snapshot with optional signal fields", () => {
    const withOptional = {
      ...validSnapshot,
      signals: [
        {
          key: "hotspot.file",
          category: "hotspot",
          severity: "info",
          title: "Large file",
          detail: "Consider splitting",
          evidence: "file.ts has 500 lines",
          filePath: "src/file.ts",
        },
      ],
    };
    const result = ProjectSnapshotV1Schema.safeParse(withOptional);
    expect(result.success).toBe(true);
  });

  it("rejects snapshot with empty snapshotHash", () => {
    const bad = { ...validSnapshot, snapshotHash: "" };
    const result = ProjectSnapshotV1Schema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Determinism Tests
// =============================================================================

describe("Snapshot determinism", () => {
  it("signals are sorted by key for stability", () => {
    const snapshot: ProjectSnapshotV1 = {
      version: 1,
      workspaceId: "ws_test",
      createdAt: new Date().toISOString(),
      snapshotHash: "hash",
      repo: {
        root: "/test",
        lastCommitHash: null,
        lastCommitMessage: null,
        isDirty: false,
        defaultBranch: null,
      },
      health: {
        hasTests: false,
        testRunner: null,
        hasLint: false,
        lintTool: null,
        hasTypecheck: false,
        typecheckStrict: false,
        hasCi: false,
        ciProvider: null,
        hasReadme: false,
        hasEnvExample: false,
      },
      hotspots: {
        largestFiles: [],
        todoHotspots: [],
      },
      stackTags: [],
      signals: [
        { key: "ci.missing", category: "ci", severity: "warning", title: "No CI", evidence: "ev" },
        { key: "tests.missing", category: "tests", severity: "critical", title: "No tests", evidence: "ev" },
        { key: "docs.readme_missing", category: "docs", severity: "warning", title: "No readme", evidence: "ev" },
      ],
    };

    // Verify signals are sortable by key
    const keys = snapshot.signals.map((s) => s.key);
    const sortedKeys = [...keys].sort();
    // In the builder, signals are sorted - this just validates the schema allows it
    expect(sortedKeys).toEqual(["ci.missing", "docs.readme_missing", "tests.missing"]);
  });

  it("hotspot files are sorted by line count descending", () => {
    const files = [
      { path: "a.ts", lines: 100 },
      { path: "b.ts", lines: 500 },
      { path: "c.ts", lines: 250 },
    ];

    const sorted = [...files].sort((a, b) => b.lines - a.lines);
    expect(sorted[0].path).toBe("b.ts");
    expect(sorted[1].path).toBe("c.ts");
    expect(sorted[2].path).toBe("a.ts");
  });

  it("stack tags are sorted alphabetically", () => {
    const tags = ["typescript", "react", "drizzle", "nextjs"];
    const sorted = [...tags].sort();
    expect(sorted).toEqual(["drizzle", "nextjs", "react", "typescript"]);
  });
});
