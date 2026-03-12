import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import { suggestions, type NewSuggestion, type Suggestion } from "../schema";

export async function storeSuggestions(data: NewSuggestion[]): Promise<Suggestion[]> {
  if (data.length === 0) {
    return [];
  }

  await ensureInitialized();
  const db = getDb();
  await db.insert(suggestions).values(data);
  return listSuggestionsForAnalysisRun(data[0].analysisRunId);
}

export async function listSuggestionsForRepository(
  repositoryId: string
): Promise<Suggestion[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(suggestions)
    .where(eq(suggestions.repositoryId, repositoryId))
    .orderBy(desc(suggestions.priorityScore), desc(suggestions.createdAt));
}

export async function listSuggestionsForAnalysisRun(
  analysisRunId: string
): Promise<Suggestion[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(suggestions)
    .where(eq(suggestions.analysisRunId, analysisRunId))
    .orderBy(desc(suggestions.priorityScore), desc(suggestions.createdAt));
}

export async function getSuggestion(id: string): Promise<Suggestion | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(suggestions).where(eq(suggestions.id, id));
  return result[0];
}
