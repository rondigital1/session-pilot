import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { StringDecoder } from "string_decoder";
import type {
  AgentAdapter,
  AgentExecutionCallbacks,
  AgentExecutionHandle,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentTerminationReason,
} from "./agentAdapter";

const execFileAsync = promisify(execFile);
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_SHUTDOWN_GRACE_PERIOD_MS = 10 * 1000;
const SAFE_PATH = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function createChildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: SAFE_PATH,
  };
}

function normalizeLine(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function pipeStreamLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => Promise<void> | void
): Promise<void> {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let pending = Promise.resolve();
  let settled = false;

  return new Promise<void>((resolve, reject) => {
    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const flushCompleteLines = () => {
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = normalizeLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        pending = pending.then(() => onLine(line));
        newlineIndex = buffer.indexOf("\n");
      }
    };

    stream.on("data", (chunk: Buffer | string) => {
      if (settled) {
        return;
      }

      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
      flushCompleteLines();
    });

    stream.on("end", () => {
      if (settled) {
        return;
      }

      buffer += decoder.end();
      if (buffer.length > 0) {
        pending = pending.then(() => onLine(normalizeLine(buffer)));
      }

      void pending.then(
        () => {
          if (settled) {
            return;
          }

          settled = true;
          resolve();
        },
        (error) => {
          rejectOnce(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });

    stream.on("error", (error) => {
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export class CodexCliAdapter implements AgentAdapter {
  public readonly id = "codex-cli";

  public readonly label = "Codex CLI";

  public async checkAvailability() {
    try {
      await execFileAsync("codex", ["--version"], {
        shell: false,
        windowsHide: true,
        env: createChildEnv(),
      });
      return {
        available: true,
      };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async startExecution(
    options: AgentExecutionOptions,
    callbacks: AgentExecutionCallbacks
  ): Promise<AgentExecutionHandle> {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : createAbortError("Execution was cancelled before the agent started.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    const shutdownGracePeriodMs =
      options.shutdownGracePeriodMs ?? DEFAULT_SHUTDOWN_GRACE_PERIOD_MS;
    const child = spawn(
      "codex",
      [
        "-a",
        "never",
        "exec",
        "--json",
        "-s",
        "workspace-write",
        "-C",
        options.worktreePath,
        "-o",
        options.outputFilePath,
        options.prompt,
      ],
      {
        cwd: options.worktreePath,
        shell: false,
        windowsHide: true,
        env: createChildEnv(),
      }
    );

    let terminationReason: AgentTerminationReason = "exit";
    let killTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;
    let processExited = false;

    const clearTimers = () => {
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }

      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };

    const cancel = (reason: Exclude<AgentTerminationReason, "exit"> = "cancelled") => {
      if (terminationReason === "exit") {
        terminationReason = reason;
      }

      if (processExited || child.killed) {
        return;
      }

      child.kill("SIGTERM");

      if (!killTimer) {
        killTimer = setTimeout(() => {
          if (!processExited && !child.killed) {
            child.kill("SIGKILL");
          }
        }, shutdownGracePeriodMs);
        killTimer.unref();
      }
    };

    const stdoutPromise = child.stdout
      ? pipeStreamLines(child.stdout, async (line) => {
          await callbacks.onStdoutLine(line);

          try {
            await callbacks.onAgentEvent(JSON.parse(line));
          } catch {
            return;
          }
        })
      : Promise.resolve();
    const stderrPromise = child.stderr
      ? pipeStreamLines(child.stderr, callbacks.onStderrLine)
      : Promise.resolve();

    stdoutPromise.catch(() => {
      cancel("cancelled");
    });
    stderrPromise.catch(() => {
      cancel("cancelled");
    });

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        cancel("timeout");
      }, timeoutMs);
      timeoutTimer.unref();
    }

    if (options.signal) {
      abortListener = () => {
        cancel("cancelled");
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    const exitPromise = new Promise<AgentExecutionResult>((resolve, reject) => {
      child.once("error", (error) => {
        processExited = true;
        clearTimers();
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      child.once("exit", (exitCode, signal) => {
        processExited = true;
        clearTimers();
        resolve({
          exitCode,
          signal,
          terminationReason,
        });
      });
    });

    const completion = Promise.all([exitPromise, stdoutPromise, stderrPromise])
      .then(([result]) => {
        if (
          options.signal?.aborted &&
          result.terminationReason === "exit" &&
          result.exitCode === null
        ) {
          throw options.signal.reason instanceof Error
            ? options.signal.reason
            : createAbortError("Execution was cancelled.");
        }

        return result;
      })
      .finally(() => {
        clearTimers();
        if (abortListener && options.signal) {
          options.signal.removeEventListener("abort", abortListener);
        }
      });

    return {
      pid: child.pid,
      child,
      cancel,
      completion,
    };
  }
}
