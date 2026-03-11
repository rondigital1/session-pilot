import type { SessionSummary, SessionTask } from "@/server/db/schema";
import type {
  SessionMetrics,
  UITask,
  UITaskChecklistItem,
  UITaskContext,
} from "@/server/types/domain";
import {
  taskChecklistItemSchema,
  taskContextSchema,
} from "@/server/validation/api";

export function parseTaskChecklist(
  value: string | null
): UITaskChecklistItem[] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const result = taskChecklistItemSchema.array().safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseTaskContext(value: string | null): UITaskContext | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    const result = taskContextSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function serializeSessionTask(task: SessionTask): UITask {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    estimatedMinutes: task.estimatedMinutes ?? undefined,
    status: task.status,
    notes: task.notes ?? undefined,
    checklist: parseTaskChecklist(task.checklist),
    context: parseTaskContext(task.context),
  };
}

export function serializeSessionMetrics(summary: SessionSummary): SessionMetrics {
  return {
    tasksCompleted: summary.tasksCompleted,
    tasksTotal: summary.tasksTotal,
    tasksPending: summary.tasksPending,
    tasksSkipped: summary.tasksSkipped,
    completionRate: summary.completionRate,
    totalEstimatedMinutes: summary.totalEstimatedMinutes,
    actualDurationMinutes: summary.actualDurationMinutes,
  };
}
