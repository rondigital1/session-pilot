/**
 * Improvement Idea Generator
 *
 * Uses Claude to generate ranked improvement ideas from a ProjectSnapshot.
 * Each idea must cite >= 2 evidence items from the snapshot signals.
 * LLM output is validated with Zod; on failure, retries once with a fix prompt.
 */

import type { ProjectSnapshotV1 } from "@/server/snapshot/schema";
import {
  getClaudeClient,
  isClaudeConfigured,
  DEFAULT_MODEL,
} from "@/server/agent/claudeClient";
import { IdeaArraySchema, validateIdeasEvidence, type Idea } from "./schema";

// =============================================================================
// Types
// =============================================================================

export interface GenerateIdeasOptions {
  snapshot: ProjectSnapshotV1;
  rejectedTitles?: string[];
  timeBudgetMinutes?: number;
  goalText?: string;
  focusWeights?: {
    testing: number;
    frontend: number;
    backend: number;
    database: number;
    bugFixing: number;
  };
}

// =============================================================================
// Prompt
// =============================================================================

const IDEA_GENERATION_SYSTEM_PROMPT = `You are a senior engineering coach analyzing a project snapshot to generate actionable improvement ideas.

HARD RULES:
1. Each idea MUST cite at least 2 evidence items referencing snapshot signal keys or concrete file/config evidence from the snapshot.
2. No generic suggestions without evidence from the snapshot.
3. Keep steps actionable - the first step should be doable in 60-90 minutes.
4. Return ONLY valid JSON matching the schema exactly. No markdown, no commentary.
5. Generate 6-10 ideas, ranked by score (highest first).
6. Score = (impact_weight * confidence) where impact_weight: high=90, medium=60, low=30
7. Deduct 15 points from score if effort is "large", 5 if "medium".
8. Do NOT suggest ideas whose titles appear in the rejected list.

SCHEMA for each idea:
{
  "title": "string - clear, actionable title",
  "category": "testing | ci_cd | documentation | types | performance | security | code_quality | developer_experience | architecture",
  "impact": "low | medium | high",
  "effort": "small | medium | large",
  "risk": "low | medium | high",
  "confidence": 0.0-1.0,
  "score": 0-100,
  "evidence": [
    { "signalKey": "string - signal key from snapshot or descriptive key", "detail": "string - specific detail" }
  ],
  "acceptanceCriteria": ["string - measurable criteria"],
  "steps": ["string - actionable step"]
}

Return a JSON array of idea objects. No wrapping object, just the array.`;

function buildUserPrompt(options: GenerateIdeasOptions): string {
  const { snapshot, rejectedTitles, timeBudgetMinutes, goalText } = options;

  const parts: string[] = [];

  parts.push("## Project Snapshot");
  parts.push(`Workspace: ${snapshot.workspaceId}`);
  parts.push(`Stack: ${snapshot.stackTags.join(", ") || "not detected"}`);
  parts.push("");

  parts.push("### Health");
  const h = snapshot.health;
  parts.push(`- Tests: ${h.hasTests ? `yes (${h.testRunner})` : "NO"}`);
  parts.push(`- Lint: ${h.hasLint ? `yes (${h.lintTool})` : "NO"}`);
  parts.push(`- TypeScript strict: ${h.typecheckStrict ? "yes" : "NO"}`);
  parts.push(`- CI: ${h.hasCi ? `yes (${h.ciProvider})` : "NO"}`);
  parts.push(`- README: ${h.hasReadme ? "yes" : "NO"}`);
  parts.push(`- .env.example: ${h.hasEnvExample ? "yes" : "NO"}`);
  parts.push("");

  parts.push("### Signals");
  for (const signal of snapshot.signals) {
    parts.push(`- [${signal.key}] (${signal.severity}) ${signal.title}: ${signal.evidence}`);
  }
  parts.push("");

  if (snapshot.hotspots.largestFiles.length > 0) {
    parts.push("### Largest Files");
    for (const f of snapshot.hotspots.largestFiles.slice(0, 5)) {
      parts.push(`- ${f.path}: ${f.lines} lines`);
    }
    parts.push("");
  }

  if (snapshot.hotspots.todoHotspots.length > 0) {
    parts.push("### TODO Hotspots");
    for (const t of snapshot.hotspots.todoHotspots.slice(0, 5)) {
      parts.push(`- ${t.path}: ${t.count} TODOs`);
    }
    parts.push("");
  }

  if (rejectedTitles && rejectedTitles.length > 0) {
    parts.push("### Recently Rejected Ideas (DO NOT suggest these again)");
    for (const title of rejectedTitles) {
      parts.push(`- ${title}`);
    }
    parts.push("");
  }

  if (goalText) {
    parts.push(`### User Goal: ${goalText}`);
    parts.push("");
  }

  if (timeBudgetMinutes) {
    parts.push(`### Time Budget: ${timeBudgetMinutes} minutes per session`);
    parts.push("");
  }

  parts.push("Generate 6-10 improvement ideas as a JSON array. Each must have >= 2 evidence items.");

  return parts.join("\n");
}

// =============================================================================
// Parsing + Validation
// =============================================================================

function extractJsonArray(text: string): string {
  // Try to extract JSON from markdown code blocks first
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) {
    return blockMatch[1].trim();
  }

  // Try to find array brackets
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1);
  }

  return text.trim();
}

function parseAndValidateIdeas(rawText: string): Idea[] {
  const jsonStr = extractJsonArray(rawText);
  const parsed = JSON.parse(jsonStr);
  const validated = IdeaArraySchema.parse(parsed);
  return validateIdeasEvidence(validated);
}

// =============================================================================
// Fallback Ideas
// =============================================================================

function generateFallbackIdeas(snapshot: ProjectSnapshotV1): Idea[] {
  const ideas: Idea[] = [];

  if (!snapshot.health.hasTests) {
    ideas.push({
      title: "Add a test framework and initial test suite",
      category: "testing",
      impact: "high",
      effort: "medium",
      risk: "low",
      confidence: 1.0,
      score: 85,
      evidence: [
        { signalKey: "tests.missing", detail: "No test runner found in project dependencies" },
        { signalKey: "health.tests", detail: "No test directory (tests/, __tests__, test/) detected" },
      ],
      acceptanceCriteria: [
        "Test runner installed and configured",
        "At least one passing test exists",
        "npm test script works",
      ],
      steps: [
        "Choose and install a test runner (vitest recommended for modern projects)",
        "Create a test directory and add a sample test",
        "Add a test script to package.json",
        "Run tests to verify setup",
      ],
    });
  }

  if (!snapshot.health.hasCi) {
    ideas.push({
      title: "Set up CI/CD pipeline for automated testing",
      category: "ci_cd",
      impact: "high",
      effort: "small",
      risk: "low",
      confidence: 1.0,
      score: 88,
      evidence: [
        { signalKey: "ci.missing", detail: "No CI config files detected in project" },
        { signalKey: "health.ci", detail: "No .github/workflows, .circleci, or .gitlab-ci.yml found" },
      ],
      acceptanceCriteria: [
        "CI pipeline runs on push/PR",
        "Pipeline includes lint and test steps",
      ],
      steps: [
        "Create .github/workflows/ci.yml with lint and test jobs",
        "Configure trigger on push to main and pull requests",
        "Test the pipeline with a sample push",
      ],
    });
  }

  // Add generic quality improvement if we have signals
  if (snapshot.signals.length > 0 && ideas.length < 2) {
    const topSignals = snapshot.signals.slice(0, 2);
    ideas.push({
      title: "Address top project health signals",
      category: "code_quality",
      impact: "medium",
      effort: "small",
      risk: "low",
      confidence: 0.8,
      score: 45,
      evidence: topSignals.map((s) => ({
        signalKey: s.key,
        detail: s.evidence,
      })),
      acceptanceCriteria: ["At least 2 health signals resolved"],
      steps: topSignals.map((s) => `Fix: ${s.title}`),
    });
  }

  return ideas;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate improvement ideas from a project snapshot.
 *
 * Uses Claude to analyze the snapshot and produce ranked, evidence-gated ideas.
 * Falls back to deterministic ideas when Claude is not configured.
 * Validates output with Zod and retries once on schema failure.
 */
export async function generateImprovementIdeas(
  options: GenerateIdeasOptions
): Promise<Idea[]> {
  const { snapshot } = options;

  if (!isClaudeConfigured()) {
    console.warn("[IdeaGenerator] Claude not configured, using fallback ideas");
    return generateFallbackIdeas(snapshot);
  }

  const client = getClaudeClient();
  const userPrompt = buildUserPrompt(options);

  // First attempt
  let rawText: string;
  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: IDEA_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.warn("[IdeaGenerator] No text content in response, using fallback");
      return generateFallbackIdeas(snapshot);
    }
    rawText = textBlock.text;
  } catch (error) {
    console.error("[IdeaGenerator] Claude API call failed:", error);
    return generateFallbackIdeas(snapshot);
  }

  // Validate first attempt
  try {
    return parseAndValidateIdeas(rawText);
  } catch (firstError) {
    console.warn("[IdeaGenerator] First attempt validation failed, retrying:", firstError);
  }

  // Retry with fix prompt
  try {
    const fixPrompt =
      `The previous response had schema errors. Fix the JSON to match the schema exactly.\n` +
      `No extra keys. Each idea needs >= 2 evidence items.\n` +
      `Return ONLY the corrected JSON array.\n\n` +
      `Previous response:\n${rawText}`;

    const retryResponse = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: IDEA_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: fixPrompt }],
    });

    const retryBlock = retryResponse.content.find((b) => b.type === "text");
    if (!retryBlock || retryBlock.type !== "text") {
      console.warn("[IdeaGenerator] Retry produced no text, using fallback");
      return generateFallbackIdeas(snapshot);
    }

    return parseAndValidateIdeas(retryBlock.text);
  } catch (retryError) {
    console.error("[IdeaGenerator] Retry also failed, using fallback:", retryError);
    return generateFallbackIdeas(snapshot);
  }
}
