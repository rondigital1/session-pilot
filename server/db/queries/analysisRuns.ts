import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import { analysisRuns, type AnalysisRun, type NewAnalysisRun } from "../schema";

export async function createAnalysisRun(data: NewAnalysisRun): Promise<AnalysisRun> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(analysisRuns).values(data);
  const created = await getAnalysisRun(data.id);

  if (!created) {
    throw new Error("Failed to create analysis run");
  }

  return created;
}

export async function getAnalysisRun(id: string): Promise<AnalysisRun | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(analysisRuns).where(eq(analysisRuns.id, id));
  return result[0];
}

export async function getLatestAnalysisRunForRepository(
  repositoryId: string
): Promise<AnalysisRun | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(analysisRuns)
    .where(eq(analysisRuns.repositoryId, repositoryId))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  return result[0];
}

export async function updateAnalysisRun(
  id: string,
  data: Partial<Omit<NewAnalysisRun, "id" | "repositoryId" | "createdAt">>
): Promise<AnalysisRun | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db.update(analysisRuns).set(data).where(eq(analysisRuns.id, id));
  return getAnalysisRun(id);
}
