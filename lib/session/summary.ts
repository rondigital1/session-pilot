/**
 * Session summary generation helpers
 */

export interface SessionData {
  userGoal: string;
  timeBudgetMinutes: number;
}

export interface TaskData {
  title: string;
  status: string;
  notes?: string | null;
}

/**
 * Generate a template-based session summary
 *
 * This is a simple template-based summary generator.
 * For AI-powered summaries, use the Claude agent directly.
 */
export function generateTemplateSummary(
  session: SessionData,
  tasks: TaskData[],
  tasksCompleted: number
): string {
  const pendingTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );

  let summary = `Session focused on: "${session.userGoal}". `;
  summary += `Completed ${tasksCompleted} of ${tasks.length} tasks. `;

  if (pendingTasks.length > 0) {
    summary += `Remaining: ${pendingTasks.map((t) => t.title).join(", ")}.`;
  } else {
    summary += "All planned tasks completed!";
  }

  return summary;
}

/**
 * Extract task titles by status
 */
export function getTasksByStatus(tasks: TaskData[]): {
  completed: string[];
  pending: string[];
  skipped: string[];
} {
  return {
    completed: tasks
      .filter((t) => t.status === "completed")
      .map((t) => t.title),
    pending: tasks
      .filter((t) => t.status === "pending" || t.status === "in_progress")
      .map((t) => t.title),
    skipped: tasks.filter((t) => t.status === "skipped").map((t) => t.title),
  };
}

/**
 * Extract notes from tasks
 */
export function extractTaskNotes(tasks: TaskData[]): string[] {
  return tasks
    .filter((t) => t.notes)
    .map((t) => t.notes as string);
}
