import { describe, expect, it } from "vitest";
import {
  parseTaskChecklist,
  parseTaskContext,
  serializeSessionMetrics,
  serializeSessionTask,
} from "@/server/serializers/session";

describe("session serializers", () => {
  it("ignores invalid stored checklist and context JSON", () => {
    const task = serializeSessionTask({
      id: "task_123",
      sessionId: "sess_123",
      title: "Investigate flaky test",
      description: null,
      estimatedMinutes: 30,
      status: "pending",
      notes: null,
      checklist: "{broken",
      context: '{"files":"not-an-array"}',
      order: 0,
      createdAt: new Date("2026-03-10T12:00:00.000Z"),
      completedAt: null,
    });

    expect(task.checklist).toBeUndefined();
    expect(task.context).toBeUndefined();
  });

  it("returns undefined for completely invalid serialized values", () => {
    expect(parseTaskChecklist("not-json")).toBeUndefined();
    expect(parseTaskContext("not-json")).toBeUndefined();
  });

  it("maps stored summary rows into UI metrics", () => {
    const metrics = serializeSessionMetrics({
      id: "sum_123",
      sessionId: "sess_123",
      workspaceId: "ws_123",
      summary: "Wrapped cleanly",
      tasksCompleted: 2,
      tasksTotal: 3,
      tasksPending: 1,
      tasksSkipped: 0,
      completionRate: 67,
      totalEstimatedMinutes: 90,
      actualDurationMinutes: 75,
      createdAt: new Date("2026-03-10T12:00:00.000Z"),
    });

    expect(metrics).toEqual({
      tasksCompleted: 2,
      tasksTotal: 3,
      tasksPending: 1,
      tasksSkipped: 0,
      completionRate: 67,
      totalEstimatedMinutes: 90,
      actualDurationMinutes: 75,
    });
  });
});
