/**
 * Agent Module
 *
 * Public API for SessionPilot's agentic capabilities.
 *
 * Main exports:
 * - Session planning: generateSessionPlan, generateSummary
 * - Planning workflow: runPlanningWorkflow
 * - Client utilities: getClaudeClient, isClaudeConfigured
 * - Policy enforcement: checkPolicy, validateFilePath, validateShellCommand, validateGitCommand, validateToolAction
 */

// Session planning (primary API)
export {
  generateSessionPlan,
  generateSummary,
  generateTaskChecklist,
} from "./sessionPlanner";
export type {
  PlannerSignal,
  FocusWeights,
  PlanOptions,
  SummaryOptions,
  ChecklistOptions,
  PlannedTask,
} from "./sessionPlanner";

// Planning workflow orchestration
export { runPlanningWorkflow } from "./planningWorkflow";
export type { PlanningWorkflowOptions } from "./planningWorkflow";

// Claude client (low-level)
export {
  getClaudeClient,
  resetClaudeClient,
  isClaudeConfigured,
  DEFAULT_MODEL,
  PLANNING_MAX_TOKENS,
  SUMMARY_MAX_TOKENS,
} from "./claudeClient";

// Policy enforcement
export {
  checkPolicy,
  validateFilePath,
  validateShellCommand,
  validateGitCommand,
  validateToolAction,
  getPolicySummary,
  DEFAULT_POLICIES,
} from "./policy";
export type { ToolCategory, ToolPolicy } from "./policy";
