import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRequest } from "./helpers/request";

const {
  getSessionMock,
  getSessionSummaryMock,
  listSessionTasksMock,
  getWorkspaceMock,
  listSessionsForWorkspaceMock,
  listSessionSummariesForWorkspaceMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionSummaryMock: vi.fn(),
  listSessionTasksMock: vi.fn(),
  getWorkspaceMock: vi.fn(),
  listSessionsForWorkspaceMock: vi.fn(),
  listSessionSummariesForWorkspaceMock: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getSession: getSessionMock,
  getSessionSummary: getSessionSummaryMock,
  listSessionTasks: listSessionTasksMock,
  getWorkspace: getWorkspaceMock,
  listSessionsForWorkspace: listSessionsForWorkspaceMock,
  listSessionSummariesForWorkspace: listSessionSummariesForWorkspaceMock,
}));

import { GET as getSessionRoute } from "@/app/api/session/[id]/route";
import { GET as getWorkspaceSessionsRoute } from "@/app/api/workspaces/[id]/sessions/route";

describe("session read routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serializes session detail with stored task context and summary metrics", async () => {
    getSessionMock.mockResolvedValue({
      id: "sess_123",
      workspaceId: "ws_123",
      userGoal: "Polish the release demo",
      timeBudgetMinutes: 75,
      focusBugs: 0.4,
      focusFeatures: 0.7,
      focusRefactor: 0.3,
      status: "completed",
      summary: "Old inline summary",
      startedAt: new Date("2026-03-10T12:00:00.000Z"),
      endedAt: new Date("2026-03-10T13:05:00.000Z"),
    });
    listSessionTasksMock.mockResolvedValue([
      {
        id: "task_1",
        sessionId: "sess_123",
        title: "Reconnect detail page",
        description: null,
        estimatedMinutes: 30,
        status: "completed",
        notes: "Confirmed on refresh",
        checklist: '[{"id":"check_1","title":"Verify query param recovery","done":true}]',
        context:
          '{"files":["app/tasks/[id]/page.tsx"],"relatedIssues":["issue-1"],"links":[{"label":"PR","url":"https://example.com/pr/1"}]}',
        order: 0,
        createdAt: new Date("2026-03-10T12:00:00.000Z"),
        completedAt: new Date("2026-03-10T12:30:00.000Z"),
      },
    ]);
    getSessionSummaryMock.mockResolvedValue({
      id: "sum_123",
      sessionId: "sess_123",
      workspaceId: "ws_123",
      summary: "Stored summary wins over session.summary",
      tasksCompleted: 1,
      tasksTotal: 1,
      tasksPending: 0,
      tasksSkipped: 0,
      completionRate: 100,
      totalEstimatedMinutes: 30,
      actualDurationMinutes: 65,
      createdAt: new Date("2026-03-10T13:05:00.000Z"),
    });

    const response = await getSessionRoute(
      createApiRequest("/api/session/sess_123"),
      { params: Promise.resolve({ id: "sess_123" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: {
        id: "sess_123",
        workspaceId: "ws_123",
        userGoal: "Polish the release demo",
        timeBudgetMinutes: 75,
        focusWeights: {
          bugs: 0.4,
          features: 0.7,
          refactor: 0.3,
        },
        status: "completed",
        tasks: [
          {
            id: "task_1",
            title: "Reconnect detail page",
            description: undefined,
            estimatedMinutes: 30,
            status: "completed",
            notes: "Confirmed on refresh",
            checklist: [
              {
                id: "check_1",
                title: "Verify query param recovery",
                done: true,
              },
            ],
            context: {
              files: ["app/tasks/[id]/page.tsx"],
              relatedIssues: ["issue-1"],
              links: [{ label: "PR", url: "https://example.com/pr/1" }],
            },
          },
        ],
        summary: "Stored summary wins over session.summary",
        metrics: {
          tasksCompleted: 1,
          tasksTotal: 1,
          tasksPending: 0,
          tasksSkipped: 0,
          completionRate: 100,
          totalEstimatedMinutes: 30,
          actualDurationMinutes: 65,
        },
        startedAt: "2026-03-10T12:00:00.000Z",
        endedAt: "2026-03-10T13:05:00.000Z",
      },
    });
  });

  it("merges stored summaries into workspace session history items", async () => {
    getWorkspaceMock.mockResolvedValue({
      id: "ws_123",
      name: "SessionPilot",
    });
    listSessionsForWorkspaceMock.mockResolvedValue([
      {
        id: "sess_completed",
        workspaceId: "ws_123",
        userGoal: "Wrap release candidate",
        timeBudgetMinutes: 60,
        focusBugs: 0.5,
        focusFeatures: 0.6,
        focusRefactor: 0.2,
        status: "completed",
        summary: "Stale inline summary",
        startedAt: new Date("2026-03-10T14:00:00.000Z"),
        endedAt: new Date("2026-03-10T15:00:00.000Z"),
      },
      {
        id: "sess_active",
        workspaceId: "ws_123",
        userGoal: "Resume onboarding polish",
        timeBudgetMinutes: 45,
        focusBugs: 0.3,
        focusFeatures: 0.8,
        focusRefactor: 0.4,
        status: "active",
        summary: null,
        startedAt: new Date("2026-03-10T16:00:00.000Z"),
        endedAt: null,
      },
    ]);
    listSessionSummariesForWorkspaceMock.mockResolvedValue([
      {
        id: "sum_completed",
        sessionId: "sess_completed",
        workspaceId: "ws_123",
        summary: "Stored summary for history cards",
        tasksCompleted: 2,
        tasksTotal: 3,
        tasksPending: 1,
        tasksSkipped: 0,
        completionRate: 67,
        totalEstimatedMinutes: 70,
        actualDurationMinutes: 60,
        createdAt: new Date("2026-03-10T15:00:00.000Z"),
      },
    ]);

    const response = await getWorkspaceSessionsRoute(
      createApiRequest("/api/workspaces/ws_123/sessions?limit=2"),
      { params: Promise.resolve({ id: "ws_123" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessions: [
        {
          id: "sess_completed",
          workspaceId: "ws_123",
          userGoal: "Wrap release candidate",
          timeBudgetMinutes: 60,
          focusWeights: {
            bugs: 0.5,
            features: 0.6,
            refactor: 0.2,
          },
          status: "completed",
          summary: "Stored summary for history cards",
          metrics: {
            tasksCompleted: 2,
            tasksTotal: 3,
            tasksPending: 1,
            tasksSkipped: 0,
            completionRate: 67,
            totalEstimatedMinutes: 70,
            actualDurationMinutes: 60,
          },
          startedAt: "2026-03-10T14:00:00.000Z",
          endedAt: "2026-03-10T15:00:00.000Z",
        },
        {
          id: "sess_active",
          workspaceId: "ws_123",
          userGoal: "Resume onboarding polish",
          timeBudgetMinutes: 45,
          focusWeights: {
            bugs: 0.3,
            features: 0.8,
            refactor: 0.4,
          },
          status: "active",
          summary: null,
          metrics: null,
          startedAt: "2026-03-10T16:00:00.000Z",
          endedAt: null,
        },
      ],
    });
  });

  it("rejects invalid workspace history limits", async () => {
    getWorkspaceMock.mockResolvedValue({
      id: "ws_123",
      name: "SessionPilot",
    });

    const response = await getWorkspaceSessionsRoute(
      createApiRequest("/api/workspaces/ws_123/sessions?limit=0"),
      { params: Promise.resolve({ id: "ws_123" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "limit must be an integer between 1 and 50",
    });
    expect(listSessionsForWorkspaceMock).not.toHaveBeenCalled();
    expect(listSessionSummariesForWorkspaceMock).not.toHaveBeenCalled();
  });
});
