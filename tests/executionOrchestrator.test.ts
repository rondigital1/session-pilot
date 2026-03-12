import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cleanupGitWorkspaceMock,
  emitExecutionEventMock,
  fsReadFileMock,
  getExecutionTaskRecordMock,
  getLatestAnalysisRunForRepositoryMock,
  getRepositoryMock,
  getSuggestionMock,
  prepareGitWorkspaceMock,
  runValidationCommandsMock,
  selectValidationCommandsMock,
  updateExecutionTaskRecordMock,
} = vi.hoisted(() => ({
  cleanupGitWorkspaceMock: vi.fn(),
  emitExecutionEventMock: vi.fn(),
  fsReadFileMock: vi.fn(),
  getExecutionTaskRecordMock: vi.fn(),
  getLatestAnalysisRunForRepositoryMock: vi.fn(),
  getRepositoryMock: vi.fn(),
  getSuggestionMock: vi.fn(),
  prepareGitWorkspaceMock: vi.fn(),
  runValidationCommandsMock: vi.fn(),
  selectValidationCommandsMock: vi.fn(),
  updateExecutionTaskRecordMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: fsReadFileMock,
}));

vi.mock("@/server/db/queries", () => ({
  getExecutionTaskRecord: getExecutionTaskRecordMock,
  getLatestAnalysisRunForRepository: getLatestAnalysisRunForRepositoryMock,
  getRepository: getRepositoryMock,
  getSuggestion: getSuggestionMock,
  updateExecutionTaskRecord: updateExecutionTaskRecordMock,
}));

vi.mock("@/server/serializers/orchestrator", () => ({
  serializeAnalysisRun: (value: unknown) => value,
  serializeExecutionTask: (value: unknown) => value,
  serializeRepository: (value: unknown) => value,
  serializeSuggestion: (value: unknown) => value,
}));

vi.mock("@/server/events/runEventStore", () => ({
  emitExecutionEvent: emitExecutionEventMock,
}));

vi.mock("@/server/execution/gitWorkspaceService", () => ({
  cleanupGitWorkspace: cleanupGitWorkspaceMock,
  prepareGitWorkspace: prepareGitWorkspaceMock,
}));

vi.mock("@/server/execution/validationRunner", () => ({
  runValidationCommands: runValidationCommandsMock,
  selectValidationCommands: selectValidationCommandsMock,
}));

import { ExecutionOrchestrator } from "@/server/execution/executionOrchestrator";

function createExecutionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "execution_1",
    repositoryId: "repo_1",
    suggestionId: "suggestion_1",
    providerId: "codex-cli",
    status: "queued",
    validationCommands: [["npm", "run", "lint"]],
    validationResults: [],
    taskSpec: {
      validationCommands: [["npm", "run", "lint"]],
    },
    agentPrompt: "Fix the issue",
    ...overrides,
  };
}

function createAdapterMock() {
  return {
    checkAvailability: vi.fn().mockResolvedValue({
      available: true,
    }),
    startExecution: vi.fn(),
    id: "codex-cli",
    label: "Codex CLI",
  };
}

async function waitForAssertion(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

function setAdapters(orchestrator: ExecutionOrchestrator, adapterMock: ReturnType<typeof createAdapterMock>): void {
  (orchestrator as unknown as { adapters: Map<string, unknown> }).adapters = new Map([
    ["codex-cli", adapterMock],
  ]);
}

function runExecution(orchestrator: ExecutionOrchestrator, executionId: string): Promise<void> {
  return (orchestrator as unknown as { run: (id: string) => Promise<void> }).run(executionId);
}

describe("ExecutionOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsReadFileMock.mockResolvedValue("Final message\n");
    prepareGitWorkspaceMock.mockResolvedValue({
      branchName: "sessionpilot/repo/execution_1",
      worktreePath: "/tmp/worktree/execution_1",
      sourceCheckoutDirty: false,
    });
    cleanupGitWorkspaceMock.mockResolvedValue(undefined);
    runValidationCommandsMock.mockResolvedValue([
      {
        command: ["npm", "run", "lint"],
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 10,
      },
    ]);
    selectValidationCommandsMock.mockImplementation((commands: string[][]) => commands);
    getRepositoryMock.mockResolvedValue({
      id: "repo_1",
      name: "Repo",
      path: "/tmp/repo",
    });
    getSuggestionMock.mockResolvedValue({
      id: "suggestion_1",
      title: "Fix runtime",
    });
    getLatestAnalysisRunForRepositoryMock.mockResolvedValue({
      id: "analysis_1",
      summary: "Summary",
    });
    updateExecutionTaskRecordMock.mockResolvedValue(undefined);
    emitExecutionEventMock.mockResolvedValue(undefined);
  });

  it("marks queued executions as cancelled when no active child process exists", async () => {
    getExecutionTaskRecordMock.mockResolvedValue(createExecutionRecord());

    const orchestrator = new ExecutionOrchestrator();

    await orchestrator.cancel("execution_1");

    expect(updateExecutionTaskRecordMock).toHaveBeenCalledWith(
      "execution_1",
      expect.objectContaining({
        status: "cancelled",
      })
    );
    expect(emitExecutionEventMock).toHaveBeenCalledWith(
      "execution_1",
      "cancelled",
      expect.objectContaining({
        message: expect.any(String),
      })
    );
  });

  it("persists normalized validation commands, runs cleanup, and completes successfully", async () => {
    const adapterMock = createAdapterMock();
    const selectedCommands = [["npm", "run", "lint"]];

    getExecutionTaskRecordMock.mockResolvedValue(
      createExecutionRecord({
        validationCommands: [[" npm ", "run", "lint"], ["npm", "run", "lint"]],
      })
    );
    selectValidationCommandsMock.mockReturnValue(selectedCommands);
    adapterMock.startExecution.mockResolvedValue({
      pid: 123,
      child: {},
      cancel: vi.fn(),
      completion: Promise.resolve({
        exitCode: 0,
        signal: null,
        terminationReason: "exit",
      }),
    });

    const orchestrator = new ExecutionOrchestrator();
    setAdapters(orchestrator, adapterMock);

    await runExecution(orchestrator, "execution_1");

    expect(selectValidationCommandsMock).toHaveBeenCalledWith(
      [[" npm ", "run", "lint"], ["npm", "run", "lint"]]
    );
    expect(updateExecutionTaskRecordMock).toHaveBeenCalledWith(
      "execution_1",
      expect.objectContaining({
        status: "preparing",
        validationCommandsJson: JSON.stringify(selectedCommands),
      })
    );
    expect(runValidationCommandsMock).toHaveBeenCalledWith(
      "/tmp/worktree/execution_1",
      selectedCommands,
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      })
    );
    expect(cleanupGitWorkspaceMock).toHaveBeenCalledWith("/tmp/repo", {
      branchName: "sessionpilot/repo/execution_1",
      worktreePath: "/tmp/worktree/execution_1",
      sourceCheckoutDirty: false,
    });
    expect(updateExecutionTaskRecordMock).toHaveBeenCalledWith(
      "execution_1",
      expect.objectContaining({
        status: "completed",
        finalMessage: "Final message",
      })
    );
    expect(emitExecutionEventMock).toHaveBeenCalledWith(
      "execution_1",
      "completed",
      expect.objectContaining({
        repositoryName: "Repo",
        suggestionTitle: "Fix runtime",
      })
    );
  });

  it("marks active executions as cancelled and cleans up the worktree", async () => {
    const adapterMock = createAdapterMock();
    let resolveCompletion:
      | ((value: {
          exitCode: number | null;
          signal: NodeJS.Signals | null;
          terminationReason: "cancelled";
        }) => void)
      | undefined;
    const completion = new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      terminationReason: "cancelled";
    }>((resolve) => {
      resolveCompletion = resolve;
    });
    const cancelMock = vi.fn();

    getExecutionTaskRecordMock.mockResolvedValue(createExecutionRecord());
    adapterMock.startExecution.mockResolvedValue({
      pid: 123,
      child: {},
      cancel: cancelMock,
      completion,
    });

    const orchestrator = new ExecutionOrchestrator();
    setAdapters(orchestrator, adapterMock);

    const runPromise = runExecution(orchestrator, "execution_1");

    await waitForAssertion(() => {
      expect(adapterMock.startExecution).toHaveBeenCalled();
    });

    await orchestrator.cancel("execution_1");
    resolveCompletion?.({
      exitCode: null,
      signal: "SIGTERM",
      terminationReason: "cancelled",
    });
    await runPromise;

    expect(cancelMock).toHaveBeenCalledWith("cancelled");
    expect(cleanupGitWorkspaceMock).toHaveBeenCalled();
    expect(updateExecutionTaskRecordMock).toHaveBeenCalledWith(
      "execution_1",
      expect.objectContaining({
        status: "cancelled",
      })
    );
    expect(emitExecutionEventMock).toHaveBeenCalledWith(
      "execution_1",
      "cancelled",
      expect.objectContaining({
        message: "Execution cancelled.",
      })
    );
  });

  it("fails the execution when the agent times out and still cleans up", async () => {
    const adapterMock = createAdapterMock();

    getExecutionTaskRecordMock.mockResolvedValue(createExecutionRecord());
    adapterMock.startExecution.mockResolvedValue({
      pid: 123,
      child: {},
      cancel: vi.fn(),
      completion: Promise.resolve({
        exitCode: null,
        signal: "SIGKILL",
        terminationReason: "timeout",
      }),
    });

    const orchestrator = new ExecutionOrchestrator();
    setAdapters(orchestrator, adapterMock);

    await runExecution(orchestrator, "execution_1");

    expect(runValidationCommandsMock).not.toHaveBeenCalled();
    expect(cleanupGitWorkspaceMock).toHaveBeenCalled();
    expect(updateExecutionTaskRecordMock).toHaveBeenCalledWith(
      "execution_1",
      expect.objectContaining({
        status: "failed",
        error: "Agent execution timed out.",
      })
    );
    expect(emitExecutionEventMock).toHaveBeenCalledWith(
      "execution_1",
      "failed",
      expect.objectContaining({
        message: "Agent execution timed out.",
      })
    );
  });
});
