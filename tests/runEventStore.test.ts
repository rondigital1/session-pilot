import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getExecutionEventsAfterMock,
  getExecutionTaskRecordMock,
  storeExecutionEventRecordMock,
} = vi.hoisted(() => ({
  getExecutionEventsAfterMock: vi.fn(),
  getExecutionTaskRecordMock: vi.fn(),
  storeExecutionEventRecordMock: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getExecutionEventsAfter: getExecutionEventsAfterMock,
  getExecutionTaskRecord: getExecutionTaskRecordMock,
  storeExecutionEventRecord: storeExecutionEventRecordMock,
}));

import { emitExecutionEvent, pollExecutionEvents } from "@/server/events/runEventStore";

describe("runEventStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeExecutionEventRecordMock.mockResolvedValue(undefined);
  });

  it("serializes complex payloads safely before storing them", async () => {
    const payload: {
      error: Error;
      id: bigint;
      self?: unknown;
    } = {
      error: new Error("boom"),
      id: BigInt(42),
    };
    payload.self = payload;

    await emitExecutionEvent("execution_1", "stdout", payload);

    const stored = storeExecutionEventRecordMock.mock.calls[0][0];
    const eventData = JSON.parse(stored.eventData);

    expect(eventData.data.error.message).toBe("boom");
    expect(eventData.data.id).toBe("42");
    expect(eventData.data.self).toBe("[Circular]");
  });

  it("truncates oversized payloads instead of failing serialization", async () => {
    await emitExecutionEvent("execution_1", "stdout", {
      line: "x".repeat(70_000),
    });

    const stored = storeExecutionEventRecordMock.mock.calls[0][0];
    const eventData = JSON.parse(stored.eventData);

    expect(eventData.data.truncated).toBe(true);
    expect(eventData.data.originalSizeBytes).toBeGreaterThan(64 * 1024);
  });

  it("reports completion when the execution is already terminal even without new events", async () => {
    getExecutionEventsAfterMock.mockResolvedValue([]);
    getExecutionTaskRecordMock.mockResolvedValue({
      status: "completed",
    });

    const result = await pollExecutionEvents("execution_1", 10);

    expect(result).toEqual({
      events: [],
      lastId: 10,
      isComplete: true,
    });
  });
});
