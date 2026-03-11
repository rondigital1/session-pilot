import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRequest } from "./helpers/request";

const {
  getWorkspaceMock,
  createSessionMock,
  runPlanningWorkflowMock,
  randomUuidMock,
} = vi.hoisted(() => ({
  getWorkspaceMock: vi.fn(),
  createSessionMock: vi.fn(),
  runPlanningWorkflowMock: vi.fn(),
  randomUuidMock: vi.fn(() => "uuid-start"),
}));

vi.mock("@/server/db/queries", () => ({
  getWorkspace: getWorkspaceMock,
  createSession: createSessionMock,
}));

vi.mock("@/server/agent/planningWorkflow", () => ({
  runPlanningWorkflow: runPlanningWorkflowMock,
}));

vi.mock("crypto", () => ({
  randomUUID: randomUuidMock,
}));

import { POST } from "@/app/api/session/start/route";

describe("POST /api/session/start", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a planning session and starts the planner with trimmed input", async () => {
    const workspace = {
      id: "ws_123",
      name: "SessionPilot",
      localPath: "/tmp/session-pilot",
      githubRepo: "ron/session-pilot",
    };

    getWorkspaceMock.mockResolvedValue(workspace);
    createSessionMock.mockResolvedValue({
      id: "sess_uuid-start",
      status: "planning",
    });
    runPlanningWorkflowMock.mockResolvedValue(undefined);

    const response = await POST(
      createApiRequest("/api/session/start", {
        method: "POST",
        body: {
          workspaceId: "ws_123",
          userGoal: "  Ship session history polish  ",
          timeBudgetMinutes: 75,
          focusWeights: {
            bugs: 0.3,
            features: 0.8,
            refactor: 0.4,
          },
        },
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      sessionId: "sess_uuid-start",
      status: "planning",
    });

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sess_uuid-start",
        workspaceId: "ws_123",
        userGoal: "Ship session history polish",
        timeBudgetMinutes: 75,
        focusBugs: 0.3,
        focusFeatures: 0.8,
        focusRefactor: 0.4,
        status: "planning",
        startedAt: expect.any(Date),
      })
    );
    expect(runPlanningWorkflowMock).toHaveBeenCalledWith({
      sessionId: "sess_uuid-start",
      workspace,
      userGoal: "Ship session history polish",
      timeBudgetMinutes: 75,
      focusWeights: {
        bugs: 0.3,
        features: 0.8,
        refactor: 0.4,
      },
    });
  });

  it("returns 404 when the workspace does not exist", async () => {
    getWorkspaceMock.mockResolvedValue(undefined);

    const response = await POST(
      createApiRequest("/api/session/start", {
        method: "POST",
        body: {
          workspaceId: "ws_missing",
          userGoal: "Ship auth",
          timeBudgetMinutes: 60,
          focusWeights: {
            bugs: 0.5,
            features: 0.5,
            refactor: 0.3,
          },
        },
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Workspace not found",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(runPlanningWorkflowMock).not.toHaveBeenCalled();
  });

  it("returns a structured 400 for malformed JSON bodies", async () => {
    const response = await POST(
      createApiRequest("/api/session/start", {
        method: "POST",
        rawBody: "{not-json",
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON",
    });
  });
});
