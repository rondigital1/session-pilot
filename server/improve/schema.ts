/**
 * Zod schemas for improvement ideas
 *
 * Validates LLM-generated idea arrays. Each idea must cite >= 2 evidence items.
 */

import { z } from "zod";

// =============================================================================
// Evidence Schema
// =============================================================================

export const IdeaEvidenceSchema = z.object({
  signalKey: z.string().min(1),
  detail: z.string().min(1),
});

// =============================================================================
// Idea Schema
// =============================================================================

export const IdeaSchema = z.object({
  title: z.string().min(1),
  category: z.enum([
    "testing",
    "ci_cd",
    "documentation",
    "types",
    "performance",
    "security",
    "code_quality",
    "developer_experience",
    "architecture",
  ]),
  impact: z.enum(["low", "medium", "high"]),
  effort: z.enum(["small", "medium", "large"]),
  risk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  score: z.number().min(0).max(100),
  evidence: z.array(IdeaEvidenceSchema).min(2),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
});

export const IdeaArraySchema = z.array(IdeaSchema).min(1).max(15);

export type IdeaEvidence = z.infer<typeof IdeaEvidenceSchema>;
export type Idea = z.infer<typeof IdeaSchema>;

/**
 * Validate that every idea has at least 2 evidence items.
 * Returns validated ideas or throws with detail about which ideas fail.
 */
export function validateIdeasEvidence(ideas: Idea[]): Idea[] {
  const failures: string[] = [];

  for (let i = 0; i < ideas.length; i++) {
    if (ideas[i].evidence.length < 2) {
      failures.push(
        `Idea ${i} ("${ideas[i].title}") has ${ideas[i].evidence.length} evidence item(s), needs >= 2`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Evidence validation failed:\n${failures.join("\n")}`
    );
  }

  return ideas;
}
