import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRequest } from "./helpers/request";

const {
  getSessionMock,
  listSessionTasksMock,
  getSessionSummaryMock,
  endSessionMock,
  storeSessionSummaryMock,
  generateSummaryMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listSessionTasksMock: vi.fn(),
  getSessionSummaryMock: vi.fn(),
  endSessionMock: vi.fn(),
  storeSessionSummaryMock: vi.fn(),
  generateSummaryMock: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getSession: getSessionMock,
  listSessionTasks: listSessionTasksMock,
  getSessionSummary: getSessionSummaryMock,
  endSession: endSessionMock,
  storeSessionSummary: storeSessionSummaryMock,
}));

vi.mock("@/server/agent", () => ({
  generateSummary: generateSummaryMock,
}));

import { POST } from "@/app/api/session/[id]/end/route";

describe("POST /api/session/[id]/end", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("returns the stored summary idempotently for already completed sessions", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess_done",
      workspaceId: "ws_123",
      status: "completed",
      summary: "Fallback session summary",
      startedAt: new Date("2026-03-10T12:00:00.000Z"),
      endedAt: new Date("2026-03-10T13:10:00.000Z"),
    });
    listSessionTasksMock.mockResolvedValue([
      { id: "task_1", title: "Polish UX", status: "completed", estimatedMinutes: 30 },
      { id: "task_2", title: "Write docs", status: "pending", estimatedMinutes: 20 },
    ]);
    getSessionSummaryMock.mockResolvedValue({
      id: "sum_sess_done",
      sessionId: "sess_done",
      workspaceId: "ws_123",
      summary: "Stored session summary",
      tasksCompleted: 1,
      tasksTotal: 2,
      tasksPending: 1,
      tasksSkipped: 0,
      completionRate: 50,
      totalEstimatedMinutes: 50,
      actualDurationMinutes: 70,
      createdAt: new Date("2026-03-10T13:10:00.000Z"),
    });

    const response = await POST(
      createApiRequest("/api/session/sess_done/end", { method: "POST" }),
      { params: Promise.resolve({ id: "sess_done" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "sess_done",
      summary: "Stored session summary",
      tasksCompleted: 1,
      tasksTotal: 2,
      metrics: {
        tasksCompleted: 1,
        tasksTotal: 2,
        tasksPending: 1,
        tasksSkipped: 0,
        completionRate: 50,
        totalEstimatedMinutes: 50,
        actualDurationMinutes: 70,
      },
    });
    expect(generateSummaryMock).not.toHaveBeenCalled();
    expect(endSessionMock).not.toHaveBeenCalled();
    expect(storeSessionSummaryMock).not.toHaveBeenCalled();
  });

  it("uses a provided summary and stores completion metrics for active sessions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T13:30:00.000Z"));

    getSessionMock.mockResolvedValue({
      id: "sess_active",
      workspaceId: "ws_123",
      userGoal: "Ship release candidate",
      timeBudgetMinutes: 90,
      status: "active",
      startedAt: new Date("2026-03-10T12:00:00.000Z"),
      endedAt: null,
    });
    listSessionTasksMock.mockResolvedValue([
      { id: "task_1", title: "Polish onboarding", status: "completed", estimatedMinutes: 30 },
      { id: "task_2", title: "Review errors", status: "pending", estimatedMinutes: 20 },
      { id: "task_3", title: "Cut scope", status: "skipped", estimatedMinutes: 15 },
    ]);
    endSessionMock.mockResolvedValue({
      id: "sess_active",
      status: "completed",
    });
    storeSessionSummaryMock.mockResolvedValue({ id: "sum_sess_active" });

    const response = await POST(
      createApiRequest("/api/session/sess_active/end", {
        method: "POST",
        body: { summary: "  Wrapped the highest-value release work  " },
      }),
      { params: Promise.resolve({ id: "sess_active" }) }
    );

    expect(response.status).toBe(200);
    const formattedSummary = `Overview:
Wrapped the highest-value release work

Accomplished:
- Polish onboarding

Still open:
- Review errors`;
    await expect(response.json()).resolves.toEqual({
      sessionId: "sess_active",
      summary: formattedSummary,
      tasksCompleted: 1,
      tasksTotal: 3,
      metrics: {
        tasksCompleted: 1,
        tasksTotal: 3,
        tasksPending: 1,
        tasksSkipped: 1,
        completionRate: 33,
        totalEstimatedMinutes: 65,
        actualDurationMinutes: 90,
      },
    });

    expect(generateSummaryMock).not.toHaveBeenCalled();
    expect(endSessionMock).toHaveBeenCalledWith("sess_active", formattedSummary);
    expect(storeSessionSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sum_sess_active",
        sessionId: "sess_active",
        workspaceId: "ws_123",
        summary: formattedSummary,
        tasksCompleted: 1,
        tasksTotal: 3,
        tasksPending: 1,
        tasksSkipped: 1,
        completionRate: 33,
        totalEstimatedMinutes: 65,
        actualDurationMinutes: 90,
        createdAt: new Date("2026-03-10T13:30:00.000Z"),
      })
    );
  });

  it("falls back to the template summary when AI summary generation fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getSessionMock.mockResolvedValue({
      id: "sess_fallback",
      workspaceId: "ws_123",
      userGoal: "Ship the release candidate",
      timeBudgetMinutes: 60,
      status: "active",
      startedAt: new Date("2026-03-10T12:00:00.000Z"),
      endedAt: null,
    });
    listSessionTasksMock.mockResolvedValue([
      { id: "task_1", title: "Tighten empty states", status: "completed", notes: "Done" },
      { id: "task_2", title: "Reconnect task detail", status: "in_progress", notes: null },
    ]);
    getSessionSummaryMock.mockResolvedValue(undefined);
    generateSummaryMock.mockRejectedValue(new Error("Anthropic unavailable"));
    endSessionMock.mockResolvedValue({
      id: "sess_fallback",
      status: "completed",
    });
    storeSessionSummaryMock.mockResolvedValue({ id: "sum_sess_fallback" });

    const response = await POST(
      createApiRequest("/api/session/sess_fallback/end", { method: "POST" }),
      { params: Promise.resolve({ id: "sess_fallback" }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.summary).toContain("Overview:");
    expect(data.summary).toContain('Session focused on: "Ship the release candidate".');
    expect(data.summary).toContain("Accomplished:\n- Tighten empty states");
    expect(data.summary).toContain("Still open:\n- Reconnect task detail");
    expect(data.summary).toContain("Notes:\n- Done");
    expect(generateSummaryMock).toHaveBeenCalledWith({
      userGoal: "Ship the release candidate",
      completedTasks: ["Tighten empty states"],
      pendingTasks: ["Reconnect task detail"],
      notes: ["Done"],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to generate AI summary, using template:",
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  it("rejects attempts to end a cancelled session", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess_cancelled",
      status: "cancelled",
      startedAt: new Date("2026-03-10T12:00:00.000Z"),
    });
    listSessionTasksMock.mockResolvedValue([]);

    const response = await POST(
      createApiRequest("/api/session/sess_cancelled/end", { method: "POST" }),
      { params: Promise.resolve({ id: "sess_cancelled" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Session is already cancelled",
    });
    expect(endSessionMock).not.toHaveBeenCalled();
  });
});
