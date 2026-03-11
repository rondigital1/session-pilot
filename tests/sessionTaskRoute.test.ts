import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRequest } from "./helpers/request";

const {
  getSessionMock,
  listSessionTasksMock,
  createSessionTaskMock,
  getTaskMock,
  updateSessionTaskMock,
  randomUuidMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listSessionTasksMock: vi.fn(),
  createSessionTaskMock: vi.fn(),
  getTaskMock: vi.fn(),
  updateSessionTaskMock: vi.fn(),
  randomUuidMock: vi.fn(() => "uuid-task"),
}));

vi.mock("@/server/db/queries", () => ({
  getSession: getSessionMock,
  listSessionTasks: listSessionTasksMock,
  createSessionTask: createSessionTaskMock,
  getTask: getTaskMock,
  updateSessionTask: updateSessionTaskMock,
}));

vi.mock("crypto", () => ({
  randomUUID: randomUuidMock,
}));

import { PATCH, POST } from "@/app/api/session/[id]/task/route";

describe("session task routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task with trimmed fields, stored order, and serialized context", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess_123",
      status: "active",
    });
    listSessionTasksMock.mockResolvedValue([
      { id: "task_a" },
      { id: "task_b" },
    ]);
    createSessionTaskMock.mockResolvedValue({
      id: "task_uuid-task",
      sessionId: "sess_123",
      title: "Reconnect task page",
      description: "Keep task detail pages stable on refresh",
      estimatedMinutes: 35,
      status: "pending",
      notes: null,
      checklist: '[{"id":"check_1","title":"Verify recovery"}]',
      context:
        '{"files":["app/tasks/[id]/page.tsx"],"links":[{"label":"Issue","url":"https://example.com/1"}]}',
      order: 2,
      createdAt: new Date("2026-03-10T12:00:00.000Z"),
      completedAt: null,
    });

    const response = await POST(
      createApiRequest("/api/session/sess_123/task", {
        method: "POST",
        body: {
          title: "  Reconnect task page  ",
          description: "  Keep task detail pages stable on refresh  ",
          estimatedMinutes: 35,
          checklist: [{ id: "check_1", title: "Verify recovery" }],
          context: {
            files: ["app/tasks/[id]/page.tsx"],
            links: [{ label: "Issue", url: "https://example.com/1" }],
          },
        },
      }),
      { params: Promise.resolve({ id: "sess_123" }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      task: {
        id: "task_uuid-task",
        title: "Reconnect task page",
        description: "Keep task detail pages stable on refresh",
        estimatedMinutes: 35,
        status: "pending",
        checklist: [{ id: "check_1", title: "Verify recovery" }],
        context: {
          files: ["app/tasks/[id]/page.tsx"],
          links: [{ label: "Issue", url: "https://example.com/1" }],
        },
      },
    });
    expect(createSessionTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task_uuid-task",
        sessionId: "sess_123",
        title: "Reconnect task page",
        description: "Keep task detail pages stable on refresh",
        estimatedMinutes: 35,
        status: "pending",
        order: 2,
        checklist: '[{"id":"check_1","title":"Verify recovery"}]',
        context:
          '{"files":["app/tasks/[id]/page.tsx"],"links":[{"label":"Issue","url":"https://example.com/1"}]}',
        createdAt: expect.any(Date),
      })
    );
  });

  it("rejects task updates when the task belongs to a different session", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getSessionMock.mockResolvedValue({
      id: "sess_123",
      status: "active",
    });
    getTaskMock.mockResolvedValue({
      id: "task_999",
      sessionId: "sess_other",
    });

    const response = await PATCH(
      createApiRequest("/api/session/sess_123/task", {
        method: "PATCH",
        body: {
          taskId: "task_999",
          status: "completed",
        },
      }),
      { params: Promise.resolve({ id: "sess_123" }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Task does not belong to this session",
    });
    expect(updateSessionTaskMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[Security] IDOR attempt: task task_999 belongs to session sess_other, not sess_123"
    );

    warnSpy.mockRestore();
  });

  it("normalizes trimmed and cleared fields before updating a task", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess_123",
      status: "active",
    });
    getTaskMock.mockResolvedValue({
      id: "task_123",
      sessionId: "sess_123",
    });
    updateSessionTaskMock.mockResolvedValue({
      id: "task_123",
      sessionId: "sess_123",
      title: "Tighten release polish",
      description: null,
      estimatedMinutes: null,
      status: "completed",
      notes: null,
      checklist: '[{"id":"check_1","title":"Smoke test"}]',
      context: '{"files":["app/page.tsx"]}',
      order: 0,
      createdAt: new Date("2026-03-10T12:00:00.000Z"),
      completedAt: new Date("2026-03-10T12:30:00.000Z"),
    });

    const response = await PATCH(
      createApiRequest("/api/session/sess_123/task", {
        method: "PATCH",
        body: {
          taskId: "task_123",
          status: "completed",
          title: "  Tighten release polish  ",
          description: "   ",
          notes: "   ",
          checklist: [{ id: "check_1", title: "Smoke test" }],
          context: { files: ["app/page.tsx"] },
          estimatedMinutes: null,
        },
      }),
      { params: Promise.resolve({ id: "sess_123" }) }
    );

    expect(response.status).toBe(200);
    expect(updateSessionTaskMock).toHaveBeenCalledWith("task_123", {
      status: "completed",
      title: "Tighten release polish",
      description: null,
      estimatedMinutes: null,
      notes: null,
      checklist: '[{"id":"check_1","title":"Smoke test"}]',
      context: '{"files":["app/page.tsx"]}',
    });
    await expect(response.json()).resolves.toEqual({
      task: {
        id: "task_123",
        title: "Tighten release polish",
        description: undefined,
        estimatedMinutes: undefined,
        status: "completed",
        notes: undefined,
        checklist: [{ id: "check_1", title: "Smoke test" }],
        context: { files: ["app/page.tsx"] },
      },
    });
  });
});
