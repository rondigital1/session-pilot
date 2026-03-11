/**
 * Session utilities
 */

export {
  generateTemplateSummary,
  formatSessionSummary,
  getTasksByStatus,
  extractTaskNotes,
  parseSessionSummary,
  getSessionSummaryPreview,
} from "./summary";
export type {
  SessionData,
  TaskData,
  FormattedSessionSummaryOptions,
  SessionSummarySection,
} from "./summary";

export {
  emitSessionEvent,
  completeSession,
  isSessionComplete,
  cleanupSession,
} from "./events";
