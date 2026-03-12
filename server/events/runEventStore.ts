import type {
  ExecutionEventRecord,
  ExecutionEventType,
} from "@/server/types/domain";
import {
  getExecutionTaskRecord,
  getExecutionEventsAfter,
  storeExecutionEventRecord,
} from "@/server/db/queries";
import { serializeExecutionEvent } from "@/server/serializers/orchestrator";

const MAX_EVENT_DATA_BYTES = 64 * 1024;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue instanceof Error) {
      return {
        name: currentValue.name,
        message: currentValue.message,
        stack: currentValue.stack,
      };
    }

    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }

    if (typeof currentValue === "function") {
      return `[Function ${currentValue.name || "anonymous"}]`;
    }

    if (typeof currentValue === "undefined") {
      return null;
    }

    if (currentValue && typeof currentValue === "object") {
      if (seen.has(currentValue)) {
        return "[Circular]";
      }

      seen.add(currentValue);
    }

    return currentValue;
  });
}

function buildEventPayload(timestamp: string, data: unknown): string {
  const serialized = safeJsonStringify({
    timestamp,
    data,
  });

  if (Buffer.byteLength(serialized, "utf8") <= MAX_EVENT_DATA_BYTES) {
    return serialized;
  }

  return safeJsonStringify({
    timestamp,
    data: {
      truncated: true,
      preview: serialized.slice(0, MAX_EVENT_DATA_BYTES),
      originalSizeBytes: Buffer.byteLength(serialized, "utf8"),
    },
  });
}

export async function emitExecutionEvent(
  executionTaskId: string,
  type: ExecutionEventType,
  data: unknown
): Promise<void> {
  const timestamp = new Date().toISOString();

  await storeExecutionEventRecord({
    executionTaskId,
    eventType: type,
    eventData: buildEventPayload(timestamp, data),
    createdAt: new Date(),
  });
}

export async function pollExecutionEvents(
  executionTaskId: string,
  afterId: number = 0
): Promise<{ events: ExecutionEventRecord[]; lastId: number; isComplete: boolean }> {
  const [rows, execution] = await Promise.all([
    getExecutionEventsAfter(executionTaskId, afterId),
    getExecutionTaskRecord(executionTaskId),
  ]);
  const events = rows.map(serializeExecutionEvent);
  const lastId = rows.length > 0 ? rows[rows.length - 1].id : afterId;
  const isComplete =
    (execution ? TERMINAL_STATUSES.has(execution.status) : false) ||
    events.some((event) => TERMINAL_STATUSES.has(event.type));

  return {
    events,
    lastId,
    isComplete,
  };
}
