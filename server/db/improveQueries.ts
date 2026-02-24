/**
 * Database queries for the Improve feature
 *
 * Handles CRUD for project snapshots, improvement ideas, and idea feedback.
 */

import { eq, desc, and, gte } from "drizzle-orm";
import { getDb, initializeDb } from "./client";
import {
  projectSnapshots,
  improvementIdeas,
  ideaFeedback,
  type ProjectSnapshot,
  type NewProjectSnapshot,
  type ImprovementIdea,
  type NewImprovementIdea,
  type IdeaFeedbackRow,
  type NewIdeaFeedback,
} from "./schema";

// Reuse the same initialization guard from queries.ts
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

async function ensureInitialized() {
  if (isInitialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = initializeDb()
      .then(() => {
        isInitialized = true;
      })
      .finally(() => {
        initializationPromise = null;
      });
  }

  await initializationPromise;
}

// =============================================================================
// Project Snapshot Queries
// =============================================================================

/**
 * Store a project snapshot
 */
export async function storeSnapshot(data: NewProjectSnapshot): Promise<ProjectSnapshot> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(projectSnapshots).values(data);
  const created = await db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.id, data.id));
  if (!created[0]) {
    throw new Error("Failed to store project snapshot");
  }
  return created[0];
}

/**
 * Get the latest snapshot for a workspace
 */
export async function getLatestSnapshot(
  workspaceId: string
): Promise<ProjectSnapshot | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.workspaceId, workspaceId))
    .orderBy(desc(projectSnapshots.createdAt))
    .limit(1);
  return result[0];
}

/**
 * Get a snapshot by ID
 */
export async function getSnapshot(id: string): Promise<ProjectSnapshot | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.id, id));
  return result[0];
}

// =============================================================================
// Improvement Idea Queries
// =============================================================================

/**
 * Store multiple improvement ideas
 */
export async function storeIdeas(ideas: NewImprovementIdea[]): Promise<ImprovementIdea[]> {
  await ensureInitialized();
  const db = getDb();
  const created: ImprovementIdea[] = [];

  for (const idea of ideas) {
    await db.insert(improvementIdeas).values(idea);
    const result = await db
      .select()
      .from(improvementIdeas)
      .where(eq(improvementIdeas.id, idea.id));
    if (result[0]) {
      created.push(result[0]);
    }
  }

  return created;
}

/**
 * Get ideas for a workspace, ordered by score descending
 */
export async function getIdeasForWorkspace(
  workspaceId: string
): Promise<ImprovementIdea[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(improvementIdeas)
    .where(eq(improvementIdeas.workspaceId, workspaceId))
    .orderBy(desc(improvementIdeas.score));
}

/**
 * Get ideas tied to a specific snapshot
 */
export async function getIdeasForSnapshot(
  snapshotId: string
): Promise<ImprovementIdea[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(improvementIdeas)
    .where(eq(improvementIdeas.snapshotId, snapshotId))
    .orderBy(desc(improvementIdeas.score));
}

/**
 * Get a single idea by ID
 */
export async function getIdea(id: string): Promise<ImprovementIdea | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(improvementIdeas)
    .where(eq(improvementIdeas.id, id));
  return result[0];
}

/**
 * Update idea status
 */
export async function updateIdeaStatus(
  id: string,
  status: ImprovementIdea["status"]
): Promise<ImprovementIdea | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db
    .update(improvementIdeas)
    .set({ status })
    .where(eq(improvementIdeas.id, id));
  return getIdea(id);
}

/**
 * Get idea IDs that were rejected in the last N days
 * Used for anti-repeat: downranking previously rejected ideas.
 */
export async function getRecentlyRejectedIdeaTitles(
  workspaceId: string,
  daysBack: number = 14
): Promise<string[]> {
  await ensureInitialized();
  const db = getDb();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const rejected = await db
    .select({ title: improvementIdeas.title })
    .from(improvementIdeas)
    .innerJoin(ideaFeedback, eq(ideaFeedback.ideaId, improvementIdeas.id))
    .where(
      and(
        eq(improvementIdeas.workspaceId, workspaceId),
        eq(ideaFeedback.vote, "down"),
        gte(ideaFeedback.createdAt, cutoff)
      )
    );

  return rejected.map((r) => r.title);
}

// =============================================================================
// Idea Feedback Queries
// =============================================================================

/**
 * Store feedback for an idea
 */
export async function storeFeedback(data: NewIdeaFeedback): Promise<IdeaFeedbackRow> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(ideaFeedback).values(data);
  const created = await db
    .select()
    .from(ideaFeedback)
    .where(eq(ideaFeedback.id, data.id));
  if (!created[0]) {
    throw new Error("Failed to store idea feedback");
  }
  return created[0];
}

/**
 * Get feedback for an idea
 */
export async function getFeedbackForIdea(
  ideaId: string
): Promise<IdeaFeedbackRow[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(ideaFeedback)
    .where(eq(ideaFeedback.ideaId, ideaId))
    .orderBy(desc(ideaFeedback.createdAt));
}
