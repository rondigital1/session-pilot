import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

import { CodexCliAdapter } from "@/server/agents/codexCliAdapter";

function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
    stderr: PassThrough;
    stdout: PassThrough;
  };

  child.pid = 123;
  child.killed = false;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    if (signal === "SIGKILL") {
      child.killed = true;
    }

    return true;
  });

  return child;
}

describe("CodexCliAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams stdout and stderr lines and parses JSON agent events", async () => {
    const adapter = new CodexCliAdapter();
    const child = createFakeChild();
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const agentEvents: unknown[] = [];

    spawnMock.mockReturnValue(child);

    const handle = await adapter.startExecution(
      {
        executionId: "execution_1",
        worktreePath: "/tmp/worktree",
        prompt: "Fix it",
        outputFilePath: "/tmp/output.txt",
      },
      {
        onStdoutLine: (line) => {
          stdoutLines.push(line);
        },
        onStderrLine: (line) => {
          stderrLines.push(line);
        },
        onAgentEvent: (payload) => {
          agentEvents.push(payload);
        },
      }
    );

    child.stdout.write('{"type":"delta"}\npartial');
    child.stderr.write("warning line");
    child.emit("exit", 0, null);
    child.stdout.end(" tail");
    child.stderr.end("\n");

    const result = await handle.completion;

    expect(result).toEqual({
      exitCode: 0,
      signal: null,
      terminationReason: "exit",
    });
    expect(stdoutLines).toEqual(['{"type":"delta"}', "partial tail"]);
    expect(stderrLines).toEqual(["warning line"]);
    expect(agentEvents).toEqual([{ type: "delta" }]);
  });

  it("escalates timed out executions from SIGTERM to SIGKILL", async () => {
    vi.useFakeTimers();

    const adapter = new CodexCliAdapter();
    const child = createFakeChild();

    spawnMock.mockReturnValue(child);

    const handle = await adapter.startExecution(
      {
        executionId: "execution_1",
        worktreePath: "/tmp/worktree",
        prompt: "Fix it",
        outputFilePath: "/tmp/output.txt",
        timeoutMs: 50,
        shutdownGracePeriodMs: 25,
      },
      {
        onStdoutLine: vi.fn(),
        onStderrLine: vi.fn(),
        onAgentEvent: vi.fn(),
      }
    );

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(25);
    child.stdout.end();
    child.stderr.end();
    child.emit("exit", null, "SIGKILL");

    const result = await handle.completion;

    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(result.terminationReason).toBe("timeout");
    expect(result.signal).toBe("SIGKILL");
  });
});
