/**
 * Zod schemas for ProjectSnapshot validation
 *
 * Defines the canonical shape of a project snapshot, used to validate
 * both builder output and LLM-generated content.
 */

import { z } from "zod";

// =============================================================================
// Signal Schema
// =============================================================================

export const SnapshotSignalSchema = z.object({
  key: z.string().min(1),
  category: z.enum([
    "tests",
    "ci",
    "docs",
    "types",
    "hotspot",
    "todo",
    "lint",
    "dependencies",
    "security",
  ]),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().min(1),
  detail: z.string().optional(),
  evidence: z.string().min(1),
  filePath: z.string().optional(),
});

// =============================================================================
// Hotspot Schemas
// =============================================================================

export const LargeFileSchema = z.object({
  path: z.string().min(1),
  lines: z.number().int().nonnegative(),
});

export const TodoHotspotSchema = z.object({
  path: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const HotspotsSchema = z.object({
  largestFiles: z.array(LargeFileSchema),
  todoHotspots: z.array(TodoHotspotSchema),
});

// =============================================================================
// Health Schema
// =============================================================================

export const HealthSchema = z.object({
  hasTests: z.boolean(),
  testRunner: z.string().nullable(),
  hasLint: z.boolean(),
  lintTool: z.string().nullable(),
  hasTypecheck: z.boolean(),
  typecheckStrict: z.boolean(),
  hasCi: z.boolean(),
  ciProvider: z.string().nullable(),
  hasReadme: z.boolean(),
  hasEnvExample: z.boolean(),
});

// =============================================================================
// Repo Info Schema
// =============================================================================

export const RepoInfoSchema = z.object({
  root: z.string().min(1),
  lastCommitHash: z.string().nullable(),
  lastCommitMessage: z.string().nullable(),
  isDirty: z.boolean(),
  defaultBranch: z.string().nullable(),
});

// =============================================================================
// ProjectSnapshot V1
// =============================================================================

export const ProjectSnapshotV1Schema = z.object({
  version: z.literal(1),
  workspaceId: z.string().min(1),
  createdAt: z.string(),
  snapshotHash: z.string().min(1),
  repo: RepoInfoSchema,
  health: HealthSchema,
  hotspots: HotspotsSchema,
  stackTags: z.array(z.string()),
  signals: z.array(SnapshotSignalSchema),
});

export type ProjectSnapshotV1 = z.infer<typeof ProjectSnapshotV1Schema>;
export type SnapshotSignal = z.infer<typeof SnapshotSignalSchema>;
export type RepoInfo = z.infer<typeof RepoInfoSchema>;
export type Health = z.infer<typeof HealthSchema>;
export type Hotspots = z.infer<typeof HotspotsSchema>;
export type LargeFile = z.infer<typeof LargeFileSchema>;
export type TodoHotspot = z.infer<typeof TodoHotspotSchema>;
