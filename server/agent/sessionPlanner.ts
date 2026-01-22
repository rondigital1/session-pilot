/**
 * Session Planner Agent
 *
 * Central module for all agentic session planning logic. This is the "brain"
 * that orchestrates signal analysis, task generation, and summary creation.
 *
 * Responsibilities:
 * - Generate focused work plans from codebase signals
 * - Create session summaries for continuity
 * - Apply focus weights to prioritize work types
 * - Ensure tasks fit within time budgets
 *
 * This module uses the Claude client for LLM calls but owns all the
 * business logic for session planning.
 */

import type { ScanSignal } from "@/server/types/domain";
import {
  PLANNING_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  formatPlanningPrompt,
  formatSummaryPrompt,
  parsePlanningResponse,
  extractTextContent,
} from "@/lib/claude";
import type { PlannedTask } from "@/lib/claude";
import { getClaudeClient, isClaudeConfigured, DEFAULT_MODEL, PLANNING_MAX_TOKENS } from "./claudeClient";

// =============================================================================
// Types
// =============================================================================

/** Input signal format accepted by the planner */
export interface PlannerSignal {
  id: string;
  signalType: string;
  title: string;
  description?: string | null;
  priority: number;
}

/** Focus weights for prioritizing different work types */
export interface FocusWeights {
  bugs: number;
  features: number;
  refactor: number;
}

/** Options for session plan generation */
export interface PlanOptions {
  signals: PlannerSignal[];
  userGoal: string;
  timeBudgetMinutes: number;
  focusWeights: FocusWeights;
}

/** Options for summary generation */
export interface SummaryOptions {
  userGoal: string;
  completedTasks: string[];
  pendingTasks: string[];
  notes: string[];
}

// Re-export PlannedTask for consumers
export type { PlannedTask };

// =============================================================================
// Fallback Task Generation (when Claude is not configured)
// =============================================================================

/**
 * Generate fallback tasks directly from signals when Claude is not available
 *
 * This provides a basic task list based on signal priorities without AI assistance.
 */
function generateFallbackTasks(
  signals: PlannerSignal[],
  userGoal: string,
  timeBudgetMinutes: number
): PlannedTask[] {
  // Sort signals by priority (highest first)
  const sortedSignals = [...signals].sort((a, b) => b.priority - a.priority);

  // Calculate time per task (leave some buffer)
  const maxTasks = Math.min(sortedSignals.length, 5);
  const avgTimePerTask = Math.floor((timeBudgetMinutes * 0.8) / maxTasks);

  const tasks: PlannedTask[] = sortedSignals.slice(0, maxTasks).map((signal, index) => {
    // Estimate time based on signal type
    let estimatedMinutes = avgTimePerTask;
    if (signal.signalType === "open_issue" || signal.signalType === "failing_test") {
      estimatedMinutes = Math.min(30, avgTimePerTask);
    } else if (signal.signalType === "open_pr") {
      estimatedMinutes = Math.min(20, avgTimePerTask);
    } else if (signal.signalType === "todo_comment") {
      estimatedMinutes = Math.min(15, avgTimePerTask);
    }

    return {
      title: signal.title,
      description: signal.description || `Work on: ${signal.title}`,
      estimatedMinutes,
      relatedSignals: [signal.id],
      order: index,
    };
  });

  // If no signals, create a task based on the user goal
  if (tasks.length === 0) {
    tasks.push({
      title: `Work on: ${userGoal}`,
      description: `Focus session on: ${userGoal}`,
      estimatedMinutes: timeBudgetMinutes,
      relatedSignals: [],
      order: 0,
    });
  }

  return tasks;
}

// =============================================================================
// Session Plan Generation
// =============================================================================

/**
 * Generate a session plan from codebase signals
 *
 * Analyzes the provided signals (TODOs, issues, PRs, etc.) in context of
 * the user's goal and generates a focused, time-boxed work plan.
 *
 * The planner:
 * 1. Normalizes input signals to a consistent format
 * 2. Formats a structured prompt with all session context
 * 3. Calls Claude to generate task recommendations
 * 4. Parses and validates the response
 *
 * @param options - Planning options including signals, goal, time, and focus
 * @returns Array of planned tasks with estimates and related signals
 * @throws Error if Claude API call fails or response is invalid
 *
 * @example
 * ```ts
 * const tasks = await generateSessionPlan({
 *   signals: [{ id: "todo-1", signalType: "todo_comment", title: "Fix auth bug", priority: 0.8 }],
 *   userGoal: "Improve authentication flow",
 *   timeBudgetMinutes: 60,
 *   focusWeights: { bugs: 0.7, features: 0.2, refactor: 0.1 }
 * });
 * ```
 */
export async function generateSessionPlan(
  options: PlanOptions
): Promise<PlannedTask[]> {
  const { signals, userGoal, timeBudgetMinutes, focusWeights } = options;

  // If Claude is not configured, generate tasks from signals directly
  if (!isClaudeConfigured()) {
    console.warn("[SessionPlanner] Claude not configured, generating fallback tasks from signals");
    return generateFallbackTasks(signals, userGoal, timeBudgetMinutes);
  }

  const client = getClaudeClient();

  // Normalize input signals to ScanSignal format for the prompt formatter
  // This handles null descriptions and ensures consistent typing
  const normalizedSignals: ScanSignal[] = signals.map((s) => ({
    id: s.id,
    source: "local" as const,
    signalType: s.signalType as ScanSignal["signalType"],
    title: s.title,
    description: s.description ?? undefined,
    priority: s.priority,
  }));

  // Format the prompt with all session context
  const userPrompt = formatPlanningPrompt(
    normalizedSignals,
    userGoal,
    timeBudgetMinutes,
    focusWeights
  );

  // Call Claude to generate the session plan
  // Using reduced max_tokens to minimize costs and avoid rate limits
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: PLANNING_MAX_TOKENS,
    system: PLANNING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Parse and validate the response into structured tasks
  return parsePlanningResponse(response);
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate a session summary
 *
 * Creates a concise summary of what was accomplished during a session,
 * suitable for display at the start of the next session to provide
 * continuity.
 *
 * The summary includes:
 * - What was accomplished (completed tasks)
 * - What remains (pending tasks)
 * - Any blockers or notes
 * - Suggestion for where to start next
 *
 * @param options - Summary options including goal, tasks, and notes
 * @returns Generated summary string
 *
 * @example
 * ```ts
 * const summary = await generateSummary({
 *   userGoal: "Improve authentication flow",
 *   completedTasks: ["Fixed login bug", "Added password reset"],
 *   pendingTasks: ["Add MFA support"],
 *   notes: ["Blocked on API rate limits for email service"]
 * });
 * ```
 */
export async function generateSummary(
  options: SummaryOptions
): Promise<string> {
  const { userGoal, completedTasks, pendingTasks, notes } = options;

  const client = getClaudeClient();

  // Format the prompt with session completion data
  const userPrompt = formatSummaryPrompt(
    userGoal,
    completedTasks,
    pendingTasks,
    notes
  );

  // Call Claude to generate the summary
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 256,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract text content, with fallback for unexpected response format
  const text = extractTextContent(response);
  return text ?? "Session completed. Unable to generate summary.";
}
