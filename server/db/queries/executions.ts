import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../client";
import { ensureInitialized } from "../init";
import {
  executionEvents,
  executionTasks,
  type ExecutionEvent,
  type ExecutionTask,
  type NewExecutionEvent,
  type NewExecutionTask,
} from "../schema";

export async function createExecutionTaskRecord(
  data: NewExecutionTask
): Promise<ExecutionTask> {
  await ensureInitialized();
  const db = getDb();
  await db.insert(executionTasks).values(data);
  const created = await getExecutionTaskRecord(data.id);

  if (!created) {
    throw new Error("Failed to create execution task");
  }

  return created;
}

export async function getExecutionTaskRecord(
  id: string
): Promise<ExecutionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.select().from(executionTasks).where(eq(executionTasks.id, id));
  return result[0];
}

export async function listExecutionTasksForRepository(
  repositoryId: string
): Promise<ExecutionTask[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.repositoryId, repositoryId))
    .orderBy(desc(executionTasks.startedAt));
}

export async function updateExecutionTaskRecord(
  id: string,
  data: Partial<Omit<NewExecutionTask, "id" | "repositoryId" | "suggestionId" | "startedAt">>
): Promise<ExecutionTask | undefined> {
  await ensureInitialized();
  const db = getDb();
  await db.update(executionTasks).set(data).where(eq(executionTasks.id, id));
  return getExecutionTaskRecord(id);
}

export async function storeExecutionEventRecord(
  data: NewExecutionEvent
): Promise<ExecutionEvent> {
  await ensureInitialized();
  const db = getDb();
  const result = await db.insert(executionEvents).values(data).returning();
  return result[0];
}

export async function getExecutionEventsAfter(
  executionTaskId: string,
  afterId: number = 0
): Promise<ExecutionEvent[]> {
  await ensureInitialized();
  const db = getDb();
  return db
    .select()
    .from(executionEvents)
    .where(
      and(
        eq(executionEvents.executionTaskId, executionTaskId),
        gt(executionEvents.id, afterId)
      )
    )
    .orderBy(executionEvents.id);
}
