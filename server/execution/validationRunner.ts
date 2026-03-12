import { execFile } from "child_process";
import { promisify } from "util";
import type { ValidationCommandResult } from "@/server/types/domain";

const execFileAsync = promisify(execFile);
const DEFAULT_VALIDATION_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_COMMANDS = 3;
const MAX_BUFFER = 10 * 1024 * 1024;
const SAFE_PATH = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";

export interface ValidationRunnerOptions {
  maxCommands?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function createCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: SAFE_PATH,
  };
}

function normalizeToken(token: unknown): string | null {
  if (typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.includes("\u0000")) {
    return null;
  }

  return trimmed;
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function selectValidationCommands(
  commands: string[][],
  maxCommands: number = DEFAULT_MAX_COMMANDS
): string[][] {
  const selected: string[][] = [];
  const seen = new Set<string>();

  for (const rawCommand of commands) {
    if (!Array.isArray(rawCommand)) {
      continue;
    }

    const normalizedCommand = rawCommand
      .map((token) => normalizeToken(token))
      .filter((token): token is string => token !== null);

    if (normalizedCommand.length === 0) {
      continue;
    }

    const key = normalizedCommand.join("\u0001");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push(normalizedCommand);

    if (selected.length >= maxCommands) {
      break;
    }
  }

  return selected;
}

export async function runValidationCommands(
  worktreePath: string,
  commands: string[][],
  options: ValidationRunnerOptions = {}
): Promise<ValidationCommandResult[]> {
  const selectedCommands = selectValidationCommands(commands, options.maxCommands);
  const results: ValidationCommandResult[] = [];

  for (const command of selectedCommands) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : createAbortError("Validation was cancelled.");
    }

    const [binary, ...args] = command;
    const startedAt = Date.now();

    try {
      const result = await execFileAsync(binary, args, {
        cwd: worktreePath,
        shell: false,
        timeout: options.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS,
        signal: options.signal,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: createCommandEnv(),
      });

      results.push({
        command,
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw options.signal?.reason instanceof Error
          ? options.signal.reason
          : error instanceof Error
            ? error
            : createAbortError("Validation was cancelled.");
      }

      const commandError = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        killed?: boolean;
      };
      const normalizedExitCode =
        typeof commandError.code === "number"
          ? commandError.code
          : commandError.killed
            ? 124
            : 1;

      results.push({
        command,
        exitCode: normalizedExitCode,
        stdout: commandError.stdout ?? "",
        stderr:
          commandError.stderr ??
          (commandError.killed
            ? "Validation command timed out."
            : error instanceof Error
              ? error.message
              : String(error)),
        durationMs: Date.now() - startedAt,
      });
    }
  }

  return results;
}
