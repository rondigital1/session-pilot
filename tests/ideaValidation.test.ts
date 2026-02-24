/**
 * Unit tests for idea schema validation and evidence gating
 */

import { describe, it, expect } from "vitest";
import {
  IdeaArraySchema,
  validateIdeasEvidence,
  type Idea,
} from "@/server/improve/schema";

// =============================================================================
// Valid Idea Fixture
// =============================================================================

function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    title: "Add test framework",
    category: "testing",
    impact: "high",
    effort: "medium",
    risk: "low",
    confidence: 0.9,
    score: 85,
    evidence: [
      { signalKey: "tests.missing", detail: "No test runner in deps" },
      { signalKey: "health.tests", detail: "No test directory found" },
    ],
    acceptanceCriteria: ["Test runner installed", "One test passes"],
    steps: ["Install vitest", "Write a test"],
    ...overrides,
  };
}

// =============================================================================
// IdeaArraySchema Tests
// =============================================================================

describe("IdeaArraySchema", () => {
  it("validates a correct idea array", () => {
    const ideas = [makeIdea(), makeIdea({ title: "Add CI" })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = IdeaArraySchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with invalid category", () => {
    const ideas = [makeIdea({ category: "invalid" as Idea["category"] })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with invalid impact", () => {
    const ideas = [makeIdea({ impact: "extreme" as Idea["impact"] })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with confidence > 1", () => {
    const ideas = [makeIdea({ confidence: 1.5 })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with score > 100", () => {
    const ideas = [makeIdea({ score: 150 })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with empty title", () => {
    const ideas = [makeIdea({ title: "" })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with empty steps", () => {
    const ideas = [makeIdea({ steps: [] })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("rejects ideas with empty acceptanceCriteria", () => {
    const ideas = [makeIdea({ acceptanceCriteria: [] })];
    const result = IdeaArraySchema.safeParse(ideas);
    expect(result.success).toBe(false);
  });

  it("validates all valid categories", () => {
    const categories: Idea["category"][] = [
      "testing", "ci_cd", "documentation", "types", "performance",
      "security", "code_quality", "developer_experience", "architecture",
    ];

    for (const category of categories) {
      const ideas = [makeIdea({ category })];
      const result = IdeaArraySchema.safeParse(ideas);
      expect(result.success).toBe(true);
    }
  });
});

// =============================================================================
// Evidence Gating Tests
// =============================================================================

describe("validateIdeasEvidence", () => {
  it("accepts ideas with >= 2 evidence items", () => {
    const ideas = [
      makeIdea({
        evidence: [
          { signalKey: "a", detail: "detail a" },
          { signalKey: "b", detail: "detail b" },
        ],
      }),
    ];
    expect(() => validateIdeasEvidence(ideas)).not.toThrow();
  });

  it("accepts ideas with > 2 evidence items", () => {
    const ideas = [
      makeIdea({
        evidence: [
          { signalKey: "a", detail: "detail a" },
          { signalKey: "b", detail: "detail b" },
          { signalKey: "c", detail: "detail c" },
        ],
      }),
    ];
    expect(() => validateIdeasEvidence(ideas)).not.toThrow();
  });

  it("rejects ideas with < 2 evidence items", () => {
    const ideas = [
      makeIdea({
        evidence: [{ signalKey: "a", detail: "only one" }],
      }),
    ];
    expect(() => validateIdeasEvidence(ideas)).toThrow(
      /Evidence validation failed/
    );
  });

  it("rejects ideas with 0 evidence items", () => {
    const ideas = [makeIdea({ evidence: [] as Idea["evidence"] })];
    // This will fail Zod validation (min 2) before reaching our validator
    const zodResult = IdeaArraySchema.safeParse(ideas);
    expect(zodResult.success).toBe(false);
  });

  it("reports which ideas fail evidence validation", () => {
    const ideas = [
      makeIdea({ title: "Good idea" }),
      makeIdea({
        title: "Bad idea",
        evidence: [{ signalKey: "a", detail: "only one" }],
      }),
    ];
    try {
      validateIdeasEvidence(ideas);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("Bad idea");
      expect((error as Error).message).toContain("1 evidence item(s)");
    }
  });

  it("validates multiple ideas - all must pass", () => {
    const ideas = [
      makeIdea({ title: "Idea A" }),
      makeIdea({ title: "Idea B" }),
      makeIdea({ title: "Idea C" }),
    ];
    const result = validateIdeasEvidence(ideas);
    expect(result).toHaveLength(3);
  });
});
