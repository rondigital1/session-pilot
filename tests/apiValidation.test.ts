import { describe, expect, it } from "vitest";
import {
  createTaskRequestSchema,
  createWorkspaceRequestSchema,
  endSessionRequestSchema,
  generateChecklistRequestSchema,
  ideaFeedbackRequestSchema,
  improveScanRequestSchema,
  scanWorkspaceRequestSchema,
  startSessionRequestSchema,
  updateTaskRequestSchema,
  updateWorkspaceRequestSchema,
} from "@/server/validation/api";

describe("startSessionRequestSchema", () => {
  it("accepts a valid session start payload", () => {
    const result = startSessionRequestSchema.safeParse({
      workspaceId: "ws_123",
      userGoal: "Ship auth flow",
      timeBudgetMinutes: 60,
      focusWeights: {
        bugs: 0.4,
        features: 0.8,
        refactor: 0.3,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid focus weights", () => {
    const result = startSessionRequestSchema.safeParse({
      workspaceId: "ws_123",
      userGoal: "Ship auth flow",
      timeBudgetMinutes: 60,
      focusWeights: {
        bugs: 1.2,
        features: 0.8,
        refactor: 0.3,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("workspace schemas", () => {
  it("requires at least one workspace locator on create", () => {
    const result = createWorkspaceRequestSchema.safeParse({
      name: "SessionPilot",
    });

    expect(result.success).toBe(false);
  });

  it("allows clearing localPath or githubRepo during update", () => {
    const clearPath = updateWorkspaceRequestSchema.safeParse({
      localPath: "",
    });
    const clearRepo = updateWorkspaceRequestSchema.safeParse({
      githubRepo: "",
    });

    expect(clearPath.success).toBe(true);
    expect(clearRepo.success).toBe(true);
  });

  it("rejects a blank workspace name during update", () => {
    const result = updateWorkspaceRequestSchema.safeParse({
      name: "   ",
    });

    expect(result.success).toBe(false);
  });
});

describe("scanWorkspaceRequestSchema", () => {
  it("rejects maxDepth above the allowed range", () => {
    const result = scanWorkspaceRequestSchema.safeParse({
      maxDepth: 11,
    });

    expect(result.success).toBe(false);
  });
});

describe("improve schemas", () => {
  it("accepts an empty optional improve body", () => {
    const result = improveScanRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid idea feedback votes", () => {
    const result = ideaFeedbackRequestSchema.safeParse({
      vote: "maybe",
    });

    expect(result.success).toBe(false);
  });
});

describe("task schemas", () => {
  it("accepts a task with checklist and context", () => {
    const result = createTaskRequestSchema.safeParse({
      title: "Ship login polish",
      description: "Tighten validation and loading states",
      estimatedMinutes: 45,
      checklist: [
        {
          id: "item_1",
          title: "Update form copy",
        },
      ],
      context: {
        files: ["app/page.tsx"],
        links: [
          {
            label: "Ticket",
            url: "https://example.com/task/123",
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects task updates with no fields to change", () => {
    const result = updateTaskRequestSchema.safeParse({
      taskId: "task_123",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid checklist generation requests", () => {
    const result = generateChecklistRequestSchema.safeParse({
      description: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an empty end-session request body", () => {
    const result = endSessionRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
