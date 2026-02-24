/**
 * Session utilities
 */

export {
  generateTemplateSummary,
  getTasksByStatus,
  extractTaskNotes,
} from "./summary";
export type { SessionData, TaskData } from "./summary";

export {
  emitSessionEvent,
  completeSession,
  isSessionComplete,
  cleanupSession,
} from "./events";
