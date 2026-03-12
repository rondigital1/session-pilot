import type { ChildProcess } from "child_process";

export interface AgentAvailability {
  available: boolean;
  detail?: string;
}

export interface AgentExecutionCallbacks {
  onStdoutLine: (line: string) => Promise<void> | void;
  onStderrLine: (line: string) => Promise<void> | void;
  onAgentEvent: (payload: unknown) => Promise<void> | void;
}

export interface AgentExecutionOptions {
  executionId: string;
  worktreePath: string;
  prompt: string;
  outputFilePath: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  shutdownGracePeriodMs?: number;
}

export type AgentTerminationReason = "cancelled" | "timeout" | "exit";

export interface AgentExecutionResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  terminationReason: AgentTerminationReason;
}

export interface AgentExecutionHandle {
  pid?: number;
  child: ChildProcess;
  cancel: (reason?: Exclude<AgentTerminationReason, "exit">) => void;
  completion: Promise<AgentExecutionResult>;
}

export interface AgentAdapter {
  id: string;
  label: string;
  checkAvailability: () => Promise<AgentAvailability>;
  startExecution: (
    options: AgentExecutionOptions,
    callbacks: AgentExecutionCallbacks
  ) => Promise<AgentExecutionHandle>;
}
