import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import { repoRoots, type NewRepoRoot, type RepoRoot } from "../schema";

export async function listRepoRoots(): Promise<RepoRoot[]> {
  await ensureInitialized();
  const db = getDb();
  return db.select().from(repoRoots);
}

export async function getRepoRoot(id: string): Promise<RepoRoot | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(repoRoots).where(eq(repoRoots.id, id));
  return result[0];
}

export async function createRepoRoot(data: NewRepoRoot): Promise<RepoRoot> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(repoRoots).values(data);
  const created = await getRepoRoot(data.id);

  if (!created) {
    throw new Error("Failed to create repo root");
  }

  return created;
}

export async function updateRepoRoot(
  id: string,
  data: Partial<Omit<NewRepoRoot, "id" | "createdAt">>
): Promise<RepoRoot | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db
    .update(repoRoots)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(repoRoots.id, id));
  return getRepoRoot(id);
}

export async function deleteRepoRoot(id: string): Promise<boolean> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.delete(repoRoots).where(eq(repoRoots.id, id));
  return (result.rowsAffected ?? 0) > 0;
}
