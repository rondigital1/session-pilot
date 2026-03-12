import * as fs from "fs/promises";
import * as path from "path";
import {
  getExecutionTaskRecord,
  getLatestAnalysisRunForRepository,
  getRepository,
  getSuggestion,
  updateExecutionTaskRecord,
} from "@/server/db/queries";
import {
  serializeAnalysisRun,
  serializeExecutionTask,
  serializeRepository,
  serializeSuggestion,
} from "@/server/serializers/orchestrator";
import { emitExecutionEvent } from "@/server/events/runEventStore";
import {
  cleanupGitWorkspace,
  prepareGitWorkspace,
  type PreparedGitWorkspace,
} from "./gitWorkspaceService";
import {
  runValidationCommands,
  selectValidationCommands,
} from "./validationRunner";
import { CodexCliAdapter } from "@/server/agents/codexCliAdapter";
import type { ExecutionStatus, ValidationCommandResult } from "@/server/types/domain";

const TERMINAL_STATUSES = new Set<ExecutionStatus>([
  "completed",
  "failed",
  "cancelled",
]);
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_VALIDATION_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_SHUTDOWN_GRACE_PERIOD_MS = 10 * 1000;

class CancelledExecutionError extends Error {
  public constructor(message: string = "Execution cancelled") {
    super(message);
    this.name = "CancelledExecutionError";
  }
}

class TimedOutExecutionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TimedOutExecutionError";
  }
}

type ActiveExecution = {
  abortController: AbortController;
  cancelRequested: boolean;
  cancel: () => void;
};

type TerminalOutcome = {
  eventData: Record<string, unknown>;
  eventType: "completed" | "failed" | "cancelled";
  recordUpdate: Record<string, unknown>;
  status: "completed" | "failed" | "cancelled";
};

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTerminalStatus(status: ExecutionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof CancelledExecutionError ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ExecutionOrchestrator {
  private readonly adapters = new Map([
    ["codex-cli", new CodexCliAdapter()],
  ]);

  private readonly activeExecutions = new Map<string, ActiveExecution>();

  public async start(executionTaskId: string): Promise<void> {
    setTimeout(() => {
      void this.run(executionTaskId);
    }, 0);
  }

  public async cancel(executionTaskId: string): Promise<void> {
    const active = this.activeExecutions.get(executionTaskId);

    if (active) {
      active.cancelRequested = true;
      active.abortController.abort(new CancelledExecutionError());
      active.cancel();
      return;
    }

    const existingExecution = await getExecutionTaskRecord(executionTaskId);
    if (!existingExecution || isTerminalStatus(existingExecution.status as ExecutionStatus)) {
      return;
    }

    await updateExecutionTaskRecord(executionTaskId, {
      status: "cancelled",
      cancelledAt: new Date(),
      completedAt: new Date(),
      error: "Cancelled before execution started",
    });
    await emitExecutionEvent(executionTaskId, "cancelled", {
      message: "Execution cancelled before the agent started.",
    });
  }

  private async run(executionTaskId: string): Promise<void> {
    if (this.activeExecutions.has(executionTaskId)) {
      return;
    }

    const executionRow = await getExecutionTaskRecord(executionTaskId);
    if (!executionRow) {
      return;
    }

    const execution = serializeExecutionTask(executionRow);
    if (isTerminalStatus(execution.status)) {
      return;
    }

    const active: ActiveExecution = {
      abortController: new AbortController(),
      cancelRequested: false,
      cancel: () => {},
    };
    this.activeExecutions.set(executionTaskId, active);

    let repositoryPath: string | null = null;
    let workspace: PreparedGitWorkspace | null = null;
    let finalMessage: string | null = null;
    let validationResults: ValidationCommandResult[] = [];
    let terminalOutcome: TerminalOutcome | null = null;
    const selectedValidationCommands = selectValidationCommands(
      execution.validationCommands.length > 0
        ? execution.validationCommands
        : execution.taskSpec.validationCommands ?? []
    );

    try {
      this.throwIfCancelled(active);

      const adapter = this.adapters.get(execution.providerId);
      if (!adapter) {
        terminalOutcome = this.buildFailedOutcome(
          `Unsupported provider: ${execution.providerId}`,
          finalMessage,
          validationResults
        );
        return;
      }

      const availability = await adapter.checkAvailability();
      this.throwIfCancelled(active);

      if (!availability.available) {
        terminalOutcome = this.buildFailedOutcome(
          `Provider ${adapter.label} is not available: ${availability.detail ?? "unknown error"}`,
          finalMessage,
          validationResults
        );
        return;
      }

      const [repositoryRow, suggestionRow, analysisRow] = await Promise.all([
        getRepository(execution.repositoryId),
        getSuggestion(execution.suggestionId),
        getLatestAnalysisRunForRepository(execution.repositoryId),
      ]);
      this.throwIfCancelled(active);

      if (!repositoryRow || !suggestionRow || !analysisRow) {
        terminalOutcome = this.buildFailedOutcome(
          "Execution dependencies are missing.",
          finalMessage,
          validationResults
        );
        return;
      }

      const repository = serializeRepository(repositoryRow, {
        lastAnalysisRunId: analysisRow.id,
      });
      const suggestion = serializeSuggestion(suggestionRow);
      const analysis = serializeAnalysisRun(analysisRow);
      repositoryPath = repository.path;

      await updateExecutionTaskRecord(executionTaskId, {
        status: "preparing",
        validationCommandsJson: JSON.stringify(selectedValidationCommands),
        validationResultsJson: JSON.stringify([]),
        error: null,
      });
      await emitExecutionEvent(executionTaskId, "status", {
        status: "preparing",
        message: "Preparing isolated git workspace.",
      });

      workspace = await prepareGitWorkspace(repository.path, executionTaskId, {
        signal: active.abortController.signal,
      });
      this.throwIfCancelled(active);

      const outputFilePath = path.join(
        workspace.worktreePath,
        ".sessionpilot-last-message.txt"
      );

      await updateExecutionTaskRecord(executionTaskId, {
        status: "running",
        branchName: workspace.branchName,
        worktreePath: workspace.worktreePath,
        validationCommandsJson: JSON.stringify(selectedValidationCommands),
        validationResultsJson: JSON.stringify([]),
      });

      await emitExecutionEvent(executionTaskId, "status", {
        status: "running",
        message: "Agent execution started.",
        worktreePath: workspace.worktreePath,
        branchName: workspace.branchName,
        sourceCheckoutDirty: workspace.sourceCheckoutDirty,
      });

      const handle = await adapter.startExecution(
        {
          executionId: executionTaskId,
          worktreePath: workspace.worktreePath,
          prompt: execution.agentPrompt,
          outputFilePath,
          signal: active.abortController.signal,
          timeoutMs: readPositiveIntegerEnv(
            "SESSIONPILOT_AGENT_TIMEOUT_MS",
            DEFAULT_AGENT_TIMEOUT_MS
          ),
          shutdownGracePeriodMs: readPositiveIntegerEnv(
            "SESSIONPILOT_PROCESS_SHUTDOWN_GRACE_MS",
            DEFAULT_SHUTDOWN_GRACE_PERIOD_MS
          ),
        },
        {
          onStdoutLine: async (line) => {
            await emitExecutionEvent(executionTaskId, "stdout", { line });
          },
          onStderrLine: async (line) => {
            await emitExecutionEvent(executionTaskId, "stderr", { line });
          },
          onAgentEvent: async (payload) => {
            await emitExecutionEvent(executionTaskId, "agent_event", payload);
          },
        }
      );
      active.cancel = () => {
        handle.cancel("cancelled");
      };

      const agentResult = await handle.completion;
      active.cancel = () => {};
      this.throwIfCancelled(active);

      if (agentResult.terminationReason === "timeout") {
        throw new TimedOutExecutionError("Agent execution timed out.");
      }

      if (agentResult.terminationReason === "cancelled") {
        throw new CancelledExecutionError();
      }

      if (agentResult.exitCode !== 0) {
        throw new Error(
          agentResult.signal
            ? `Agent exited via signal ${agentResult.signal}`
            : `Agent exited with code ${agentResult.exitCode}`
        );
      }

      finalMessage = await this.readFinalMessage(outputFilePath);
      this.throwIfCancelled(active);

      await updateExecutionTaskRecord(executionTaskId, {
        status: "validating",
        finalMessage,
        validationCommandsJson: JSON.stringify(selectedValidationCommands),
      });
      await emitExecutionEvent(executionTaskId, "validation_started", {
        message:
          selectedValidationCommands.length > 0
            ? "Running post-execution validation."
            : "No validation commands selected; skipping validation.",
        commandCount: selectedValidationCommands.length,
      });

      validationResults = await runValidationCommands(
        workspace.worktreePath,
        selectedValidationCommands,
        {
          signal: active.abortController.signal,
          timeoutMs: readPositiveIntegerEnv(
            "SESSIONPILOT_VALIDATION_TIMEOUT_MS",
            DEFAULT_VALIDATION_TIMEOUT_MS
          ),
        }
      );
      this.throwIfCancelled(active);

      for (const result of validationResults) {
        await emitExecutionEvent(executionTaskId, "validation_result", result);
      }

      const failingValidation = validationResults.find((result) => result.exitCode !== 0);
      if (failingValidation) {
        terminalOutcome = this.buildFailedOutcome(
          `Validation failed for ${failingValidation.command.join(" ")}`,
          finalMessage,
          validationResults
        );
        return;
      }

      this.throwIfCancelled(active);
      terminalOutcome = this.buildCompletedOutcome(
        {
          analysisSummary: analysis.summary,
          repositoryName: repository.name,
          suggestionTitle: suggestion.title,
        },
        finalMessage,
        validationResults
      );
    } catch (error) {
      if (isAbortLikeError(error)) {
        terminalOutcome = this.buildCancelledOutcome(finalMessage, validationResults);
      } else if (error instanceof TimedOutExecutionError) {
        terminalOutcome = this.buildFailedOutcome(
          error.message,
          finalMessage,
          validationResults
        );
      } else {
        terminalOutcome = this.buildFailedOutcome(
          normalizeErrorMessage(error),
          finalMessage,
          validationResults
        );
      }
    } finally {
      let cleanupError: Error | null = null;

      if (workspace && repositoryPath) {
        try {
          await cleanupGitWorkspace(repositoryPath, workspace);
        } catch (error) {
          cleanupError =
            error instanceof Error ? error : new Error(normalizeErrorMessage(error));
          await emitExecutionEvent(executionTaskId, "stderr", {
            line: `Workspace cleanup failed: ${cleanupError.message}`,
          });
        }
      }

      this.activeExecutions.delete(executionTaskId);

      if (!terminalOutcome) {
        return;
      }

      if (cleanupError && terminalOutcome.status === "completed") {
        terminalOutcome = this.buildFailedOutcome(
          `Workspace cleanup failed: ${cleanupError.message}`,
          finalMessage,
          validationResults
        );
      }

      await this.persistTerminalOutcome(executionTaskId, terminalOutcome);
    }
  }

  private throwIfCancelled(active: ActiveExecution): void {
    if (!active.cancelRequested && !active.abortController.signal.aborted) {
      return;
    }

    throw active.abortController.signal.reason instanceof Error
      ? active.abortController.signal.reason
      : new CancelledExecutionError();
  }

  private buildCompletedOutcome(
    details: {
      analysisSummary: string;
      repositoryName: string;
      suggestionTitle: string;
    },
    finalMessage: string | null,
    validationResults: ValidationCommandResult[]
  ): TerminalOutcome {
    return {
      status: "completed",
      eventType: "completed",
      eventData: {
        message: "Execution completed successfully.",
        ...details,
      },
      recordUpdate: {
        status: "completed",
        validationResultsJson: JSON.stringify(validationResults),
        finalMessage,
        completedAt: new Date(),
        error: null,
      },
    };
  }

  private buildFailedOutcome(
    message: string,
    finalMessage: string | null,
    validationResults: ValidationCommandResult[]
  ): TerminalOutcome {
    return {
      status: "failed",
      eventType: "failed",
      eventData: {
        message,
      },
      recordUpdate: {
        status: "failed",
        validationResultsJson: JSON.stringify(validationResults),
        finalMessage,
        completedAt: new Date(),
        error: message,
      },
    };
  }

  private buildCancelledOutcome(
    finalMessage: string | null,
    validationResults: ValidationCommandResult[]
  ): TerminalOutcome {
    return {
      status: "cancelled",
      eventType: "cancelled",
      eventData: {
        message: "Execution cancelled.",
      },
      recordUpdate: {
        status: "cancelled",
        validationResultsJson: JSON.stringify(validationResults),
        finalMessage,
        cancelledAt: new Date(),
        completedAt: new Date(),
        error: "Execution cancelled",
      },
    };
  }

  private async persistTerminalOutcome(
    executionTaskId: string,
    outcome: TerminalOutcome
  ): Promise<void> {
    await updateExecutionTaskRecord(executionTaskId, outcome.recordUpdate);
    await emitExecutionEvent(executionTaskId, outcome.eventType, outcome.eventData);
  }

  private async readFinalMessage(outputFilePath: string): Promise<string | null> {
    try {
      const raw = await fs.readFile(outputFilePath, "utf-8");
      return raw.trim() || null;
    } catch {
      return null;
    }
  }
}

export const executionOrchestrator = new ExecutionOrchestrator();
