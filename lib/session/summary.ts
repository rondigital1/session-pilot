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

export interface SessionSummarySection {
  title: string;
  kind: "paragraph" | "list";
  content: string[];
}

export interface FormattedSessionSummaryOptions {
  overview: string;
  completedTasks: string[];
  pendingTasks: string[];
  notes?: string[];
}

const SUMMARY_SECTION_TITLES = new Set([
  "Overview",
  "Accomplished",
  "Still open",
  "Notes",
]);

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

export function formatSessionSummary(
  options: FormattedSessionSummaryOptions
): string {
  const completedTasks = normalizeSummaryItems(options.completedTasks);
  const pendingTasks = normalizeSummaryItems(options.pendingTasks);
  const notes = normalizeSummaryItems(options.notes ?? []);
  const overview = normalizeSummaryParagraph(options.overview) || "Session completed.";

  const sections = [
    `Overview:\n${overview}`,
    `Accomplished:\n${formatSummaryList(
      completedTasks,
      "No tasks were completed during this session."
    )}`,
    `Still open:\n${formatSummaryList(
      pendingTasks,
      "All planned tasks were completed."
    )}`,
  ];

  if (notes.length > 0) {
    sections.push(`Notes:\n${formatSummaryList(notes)}`);
  }

  return sections.join("\n\n");
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

export function parseSessionSummary(summary: string): SessionSummarySection[] {
  const trimmed = summary.trim();
  if (!trimmed) {
    return [];
  }

  const blocks = trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections = blocks
    .map(parseSummaryBlock)
    .filter((section): section is SessionSummarySection => section !== null);

  if (sections.length === blocks.length && sections.length > 0) {
    return sections;
  }

  return [
    {
      title: "Overview",
      kind: "paragraph",
      content: [normalizeSummaryParagraph(trimmed)],
    },
  ];
}

export function getSessionSummaryPreview(summary: string): string {
  const sections = parseSessionSummary(summary);
  const overview =
    sections.find((section) => section.title === "Overview") ?? sections[0];

  return overview?.content.join(" ").trim() || "";
}

function parseSummaryBlock(block: string): SessionSummarySection | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleMatch = lines[0]?.match(/^([A-Za-z][A-Za-z ]+):$/);
  const title = titleMatch?.[1];

  if (!title || !SUMMARY_SECTION_TITLES.has(title)) {
    return null;
  }

  const contentLines = lines.slice(1);
  const listItems = contentLines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  if (listItems.length === contentLines.length && listItems.length > 0) {
    return {
      title,
      kind: "list",
      content: listItems,
    };
  }

  return {
    title,
    kind: "paragraph",
    content: contentLines.length > 0 ? [contentLines.join(" ")] : [],
  };
}

function normalizeSummaryParagraph(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeSummaryItems(items: string[]): string[] {
  return items
    .map((item) => normalizeSummaryParagraph(item))
    .filter(Boolean);
}

function formatSummaryList(items: string[], emptyMessage?: string): string {
  if (items.length === 0) {
    return emptyMessage ? `- ${emptyMessage}` : "";
  }

  return items.map((item) => `- ${item}`).join("\n");
}
