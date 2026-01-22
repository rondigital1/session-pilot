/**
 * Prompt formatters for Claude agent interactions
 */

import type { ScanSignal } from "@/server/types/domain";

export interface FocusWeights {
  bugs: number;
  features: number;
  refactor: number;
}

/**
 * Configuration for signal limits to stay within token budgets
 */
export interface SignalLimits {
  maxSignalsPerType: number;
  maxTotalSignals: number;
  maxDescriptionLength: number;
  maxTitleLength: number;
}

const DEFAULT_SIGNAL_LIMITS: SignalLimits = {
  maxSignalsPerType: 10,
  maxTotalSignals: 30,
  maxDescriptionLength: 100,
  maxTitleLength: 80,
};

/**
 * Format the planning prompt for Claude
 *
 * Transforms raw signals and session parameters into a structured prompt
 * that helps Claude generate actionable, time-boxed tasks.
 * 
 * Token optimization strategies:
 * 1. Limits signals per type and total
 * 2. Truncates long descriptions
 * 3. Prioritizes high-priority signals
 * 4. Uses compact formatting
 */
export function formatPlanningPrompt(
  signals: ScanSignal[],
  userGoal: string,
  timeBudgetMinutes: number,
  focusWeights: FocusWeights,
  limits: SignalLimits = DEFAULT_SIGNAL_LIMITS
): string {
  // Filter and limit signals to reduce token usage
  const limitedSignals = limitAndPrioritizeSignals(signals, limits);
  
  // Group signals by type for better organization in the prompt
  const signalsByType = groupSignalsByType(limitedSignals);

  // Build the signals section, grouped by type (compact format)
  const signalsSections = formatSignalsSectionsCompact(signalsByType, limits);

  // Calculate suggested time allocation based on focus weights
  const normalizedWeights = normalizeWeights(focusWeights);

  // Use a more compact prompt format
  return `## Plan ${timeBudgetMinutes}min session

Goal: ${userGoal}

Focus: bugs=${normalizedWeights.bugs}% features=${normalizedWeights.features}% refactor=${normalizedWeights.refactor}%

${signalsSections || "No signals - focus on goal."}

Return JSON array of tasks: [{"title":"...","description":"...","estimatedMinutes":N,"relatedSignals":["id"]}]`;
}

/**
 * Format the summary prompt for Claude
 */
export function formatSummaryPrompt(
  userGoal: string,
  completedTasks: string[],
  pendingTasks: string[],
  notes: string[]
): string {
  const completedSection =
    completedTasks.length > 0
      ? completedTasks.map((t) => `  - ${t}`).join("\n")
      : "  (none)";

  const pendingSection =
    pendingTasks.length > 0
      ? pendingTasks.map((t) => `  - ${t}`).join("\n")
      : "  (none)";

  const notesSection =
    notes.length > 0
      ? notes.map((n) => `  - ${n}`).join("\n")
      : "  (no notes captured)";

  return `## Session Summary Request

### ORIGINAL GOAL
${userGoal}

### COMPLETED TASKS (${completedTasks.length})
${completedSection}

### REMAINING TASKS (${pendingTasks.length})
${pendingSection}

### SESSION NOTES
${notesSection}

### INSTRUCTIONS
1. Summarize what was accomplished in 1-2 sentences
2. If there are remaining tasks, briefly note what to pick up next
3. Mention any patterns or blockers indicated in the notes
4. Keep the total summary to 2-3 sentences maximum
5. Write in a helpful, forward-looking tone for tomorrow's session`;
}

// Internal helpers

/**
 * Limit and prioritize signals to reduce token usage
 */
function limitAndPrioritizeSignals(
  signals: ScanSignal[],
  limits: SignalLimits
): ScanSignal[] {
  // Sort all signals by priority (highest first)
  const sorted = [...signals].sort((a, b) => b.priority - a.priority);
  
  // Group by type
  const byType: Record<string, ScanSignal[]> = {};
  for (const signal of sorted) {
    const type = signal.signalType;
    if (!byType[type]) byType[type] = [];
    // Only add if under per-type limit
    if (byType[type].length < limits.maxSignalsPerType) {
      byType[type].push(signal);
    }
  }
  
  // Flatten and limit total
  const limited = Object.values(byType).flat();
  
  // Sort by priority again and take top N
  return limited
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limits.maxTotalSignals);
}

function groupSignalsByType(
  signals: ScanSignal[]
): Record<string, ScanSignal[]> {
  return signals.reduce(
    (acc, signal) => {
      const type = signal.signalType;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(signal);
      return acc;
    },
    {} as Record<string, ScanSignal[]>
  );
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Format a signal in compact single-line format
 */
function formatSignalCompact(signal: ScanSignal, limits: SignalLimits): string {
  const title = truncate(signal.title, limits.maxTitleLength);
  const location = signal.filePath 
    ? ` @${signal.filePath}${signal.lineNumber ? `:${signal.lineNumber}` : ""}`
    : "";
  // Skip description and URL to save tokens - title + location is usually enough
  return `[${signal.id}] ${title}${location}`;
}

/**
 * Format signals in compact format to reduce token usage
 */
function formatSignalsSectionsCompact(
  signalsByType: Record<string, ScanSignal[]>,
  limits: SignalLimits
): string {
  return Object.entries(signalsByType)
    .map(([type, typeSignals]) => {
      const formattedSignals = typeSignals
        .sort((a, b) => b.priority - a.priority)
        .map(s => formatSignalCompact(s, limits))
        .join("\n");
      const typeLabel = type.replace(/_/g, " ").toUpperCase();
      return `${typeLabel}:\n${formattedSignals}`;
    })
    .join("\n\n");
}

// Legacy function kept for compatibility
function formatSignal(signal: ScanSignal): string {
  const parts = [
    `  - [${signal.id}] ${signal.title} (priority: ${signal.priority.toFixed(2)})`,
  ];

  if (signal.description) {
    parts.push(`    Description: ${signal.description}`);
  }
  if (signal.filePath) {
    const location = signal.lineNumber
      ? `${signal.filePath}:${signal.lineNumber}`
      : signal.filePath;
    parts.push(`    Location: ${location}`);
  }
  if (signal.url) {
    parts.push(`    URL: ${signal.url}`);
  }

  return parts.join("\n");
}

// Legacy function kept for compatibility
function formatSignalsSections(
  signalsByType: Record<string, ScanSignal[]>
): string {
  return Object.entries(signalsByType)
    .map(([type, typeSignals]) => {
      const formattedSignals = typeSignals
        .sort((a, b) => b.priority - a.priority)
        .map(formatSignal)
        .join("\n");
      return `### ${type.replace(/_/g, " ").toUpperCase()}\n${formattedSignals}`;
    })
    .join("\n\n");
}

function normalizeWeights(focusWeights: FocusWeights): {
  bugs: string;
  features: string;
  refactor: string;
} {
  const totalWeight =
    focusWeights.bugs + focusWeights.features + focusWeights.refactor;

  if (totalWeight <= 0) {
    return { bugs: "33", features: "33", refactor: "33" };
  }

  return {
    bugs: ((focusWeights.bugs / totalWeight) * 100).toFixed(0),
    features: ((focusWeights.features / totalWeight) * 100).toFixed(0),
    refactor: ((focusWeights.refactor / totalWeight) * 100).toFixed(0),
  };
}
