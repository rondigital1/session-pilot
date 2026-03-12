import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import { repositories, type NewRepository, type Repository } from "../schema";

export async function listRepositories(): Promise<Repository[]> {
  await ensureInitialized();
  const db = getDb();
  return db.select().from(repositories).orderBy(desc(repositories.updatedAt));
}

export async function listRepositoriesForRoots(rootIds: string[]): Promise<Repository[]> {
  if (rootIds.length === 0) {
    return [];
  }

  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(repositories)
    .where(inArray(repositories.rootId, rootIds))
    .orderBy(desc(repositories.updatedAt));
}

export async function getRepository(id: string): Promise<Repository | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(repositories).where(eq(repositories.id, id));
  return result[0];
}

export async function findRepositoryByPath(
  rootId: string,
  repoPath: string
): Promise<Repository | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.rootId, rootId), eq(repositories.path, repoPath)));
  return result[0];
}

export async function createRepository(data: NewRepository): Promise<Repository> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(repositories).values(data);
  const created = await getRepository(data.id);

  if (!created) {
    throw new Error("Failed to create repository");
  }

  return created;
}

export async function updateRepository(
  id: string,
  data: Partial<Omit<NewRepository, "id" | "createdAt">>
): Promise<Repository | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db
    .update(repositories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(repositories.id, id));
  return getRepository(id);
}

export async function upsertRepository(data: NewRepository): Promise<Repository> {
  const existing = await findRepositoryByPath(data.rootId, data.path);

  if (!existing) {
    return createRepository(data);
  }

  const updated = await updateRepository(existing.id, data);
  if (!updated) {
    throw new Error("Failed to update repository");
  }

  return updated;
}
