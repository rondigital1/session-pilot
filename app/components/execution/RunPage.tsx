"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import AsyncState from "@/app/components/orchestrator/AsyncState";
import StatusBadge, {
  toneForExecutionStatus,
} from "@/app/components/orchestrator/StatusBadge";
import ExecutionLogStream from "@/app/components/execution/ExecutionLogStream";
import { useExecutionEvents } from "@/app/hooks/useExecutionEvents";
import { APP_ROUTES } from "@/app/utils/api-routes";
import {
  CODEX_PROVIDER,
  cancelRun,
  fetchRun,
  orchestratorQueryKeys,
} from "@/app/utils/orchestrator-client";
import type { ExecutionStatus, ValidationCommandResult } from "@/server/types/domain";

const STEP_ORDER: ExecutionStatus[] = [
  "queued",
  "preparing",
  "running",
  "validating",
  "completed",
];

function formatTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Pending";
}

function formatDuration(startedAt: string, endedAt?: string | null): string {
  const started = new Date(startedAt).getTime();
  const ended = endedAt ? new Date(endedAt).getTime() : Date.now();
  const minutes = Math.max(Math.round((ended - started) / 60000), 0);

  if (minutes < 1) {
    return "<1 minute";
  }

  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function isTerminalStatus(status: ExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function deriveLiveStatus(
  persistedStatus: ExecutionStatus,
  events: ReturnType<typeof useExecutionEvents>["events"]
): ExecutionStatus {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "completed") {
      return "completed";
    }
    if (event.type === "failed") {
      return "failed";
    }
    if (event.type === "cancelled") {
      return "cancelled";
    }
    if (event.type === "validation_started") {
      return "validating";
    }
    if (
      event.type === "status" &&
      typeof event.data === "object" &&
      event.data !== null &&
      "status" in event.data &&
      typeof event.data.status === "string"
    ) {
      return event.data.status as ExecutionStatus;
    }
  }

  return persistedStatus;
}

function summarizeValidation(results: ValidationCommandResult[]) {
  const passed = results.filter((result) => result.exitCode === 0).length;
  const failed = results.length - passed;

  return { passed, failed };
}

function stepClasses(index: number, currentStatus: ExecutionStatus): string {
  const currentIndex = STEP_ORDER.indexOf(
    currentStatus === "failed" || currentStatus === "cancelled" ? "completed" : currentStatus
  );

  if (currentStatus === "failed" || currentStatus === "cancelled") {
    if (index < currentIndex) {
      return "border-emerald-200 bg-emerald-50";
    }

    if (index === currentIndex) {
      return "border-rose-200 bg-rose-50";
    }

    return "border-slate-200 bg-white";
  }

  if (index < currentIndex) {
    return "border-emerald-200 bg-emerald-50";
  }

  if (index === currentIndex) {
    return "border-sky-200 bg-sky-50";
  }

  return "border-slate-200 bg-white";
}

export default function RunPage({ executionId }: { executionId: string }) {
  const runQuery = useQuery({
    queryKey: orchestratorQueryKeys.execution(executionId),
    queryFn: () => fetchRun(executionId),
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status;
      return status && isTerminalStatus(status) ? false : 4000;
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(executionId),
    onSuccess: () => {
      void runQuery.refetch();
    },
  });
  const { events, connectionError, isConnected, lastEvent } = useExecutionEvents(executionId);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }

    if (
      lastEvent.type === "status" ||
      lastEvent.type === "validation_result" ||
      lastEvent.type === "completed" ||
      lastEvent.type === "failed" ||
      lastEvent.type === "cancelled"
    ) {
      void runQuery.refetch();
    }
  }, [lastEvent, runQuery]);

  if (runQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Link href={APP_ROUTES.inventory} className="text-sm font-medium text-sky-700">
          ← Back to inventory
        </Link>
        <AsyncState
          tone="loading"
          title="Loading execution"
          description="Retrieving run metadata, validation results, and the live event stream."
        />
      </div>
    );
  }

  if (runQuery.error || !runQuery.data) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Link href={APP_ROUTES.inventory} className="text-sm font-medium text-sky-700">
          ← Back to inventory
        </Link>
        <AsyncState
          tone="error"
          title="Execution unavailable"
          description={(runQuery.error as Error | null)?.message ?? "Execution not found"}
          action={
            <button
              type="button"
              onClick={() => {
                void runQuery.refetch();
              }}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  const { execution, repository, suggestion } = runQuery.data;
  const currentStatus = deriveLiveStatus(execution.status, events);
  const validationSummary = summarizeValidation(execution.validationResults);
  const reviewSummaryTitle =
    currentStatus === "completed"
      ? "Run completed"
      : currentStatus === "failed"
        ? "Run failed"
        : currentStatus === "cancelled"
          ? "Run cancelled"
          : "Run in progress";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-3 text-sm">
            {repository ? (
              <Link
                href={APP_ROUTES.repository(repository.id)}
                className="font-medium text-sky-700 hover:text-sky-900"
              >
                ← Back to repository
              </Link>
            ) : (
              <Link
                href={APP_ROUTES.inventory}
                className="font-medium text-sky-700 hover:text-sky-900"
              >
                ← Back to inventory
              </Link>
            )}
            {suggestion ? (
              <Link
                href={APP_ROUTES.suggestion(suggestion.id)}
                className="font-medium text-sky-700 hover:text-sky-900"
              >
                View suggestion
              </Link>
            ) : null}
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Execution review
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {suggestion?.title ?? "Repository execution"} running in an isolated worktree.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone={toneForExecutionStatus(currentStatus)}>{currentStatus}</StatusBadge>
            <StatusBadge tone="info">
              {execution.providerId === CODEX_PROVIDER.id ? CODEX_PROVIDER.label : execution.providerId}
            </StatusBadge>
            <StatusBadge>{events.length} streamed events</StatusBadge>
            <StatusBadge>{formatDuration(execution.startedAt, execution.completedAt)}</StatusBadge>
            <StatusBadge tone={isConnected || isTerminalStatus(currentStatus) ? "success" : "warning"}>
              {isConnected || isTerminalStatus(currentStatus) ? "stream connected" : "stream reconnecting"}
            </StatusBadge>
          </div>
        </div>

        {(currentStatus === "queued" ||
          currentStatus === "preparing" ||
          currentStatus === "running" ||
          currentStatus === "validating") ? (
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            className="rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? "Cancelling..." : "Cancel execution"}
          </button>
        ) : null}
      </div>

      {connectionError && !isTerminalStatus(currentStatus) ? (
        <AsyncState
          tone="error"
          title="Live stream issue"
          description={connectionError}
          className="shadow-none"
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-5">
        {STEP_ORDER.map((step, index) => (
          <div
            key={step}
            className={`rounded-[1.5rem] border p-4 shadow-sm ${stepClasses(index, currentStatus)}`}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Step {index + 1}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{step}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Review summary
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-950">{reviewSummaryTitle}</div>
                  <p className="mt-2 leading-6 text-slate-600">
                    Started {formatTimestamp(execution.startedAt)}
                    {execution.completedAt ? ` · finished ${formatTimestamp(execution.completedAt)}` : null}
                  </p>
                </div>
                <StatusBadge tone={toneForExecutionStatus(currentStatus)}>{currentStatus}</StatusBadge>
              </div>

              {execution.error ? (
                <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4 text-rose-700">
                  {execution.error}
                </div>
              ) : null}

              {execution.finalMessage ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Final Codex summary
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap rounded-[1.5rem] bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {execution.finalMessage}
                  </pre>
                </div>
              ) : (
                <div className="rounded-[1.5rem] bg-slate-50 p-4 text-slate-600">
                  Final review text will appear here after the agent exits.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Run details
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Repository</div>
                <div className="mt-1">{repository?.name ?? "Unknown"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Worktree</div>
                <div className="mt-1 break-all font-mono text-xs">
                  {execution.worktreePath ?? "Pending"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Branch</div>
                <div className="mt-1 font-mono text-xs">{execution.branchName ?? "Pending"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Task title</div>
                <div className="mt-1">{execution.taskSpec.title}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Validation commands
                </div>
                <div className="mt-2 space-y-2">
                  {execution.validationCommands.length > 0 ? (
                    execution.validationCommands.map((command) => (
                      <div
                        key={command.join(" ")}
                        className="rounded-2xl bg-slate-50 px-3 py-3 font-mono text-xs"
                      >
                        {command.join(" ")}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-slate-50 px-3 py-3 text-slate-500">
                      No validation commands were attached to this run.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                Validation results
              </p>
              <StatusBadge tone={validationSummary.failed > 0 ? "danger" : "success"}>
                {validationSummary.passed}/{execution.validationResults.length} passed
              </StatusBadge>
            </div>
            <div className="mt-4 space-y-4">
              {execution.validationResults.length > 0 ? (
                execution.validationResults.map((result) => (
                  <div key={result.command.join(" ")} className="rounded-[1.5rem] bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-mono text-xs text-slate-900">{result.command.join(" ")}</div>
                      <StatusBadge tone={result.exitCode === 0 ? "success" : "danger"}>
                        exit {result.exitCode}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{result.durationMs}ms</div>
                    {result.stdout ? (
                      <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-slate-700">
                        {result.stdout}
                      </pre>
                    ) : null}
                    {result.stderr ? (
                      <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                        {result.stderr}
                      </pre>
                    ) : null}
                  </div>
                ))
              ) : (
                <AsyncState
                  tone="empty"
                  title="Validation has not finished yet"
                  description="Results will populate here once the run reaches the validation phase."
                  className="shadow-none"
                />
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                Live logs
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Switch between milestone events and raw stdout or stderr without leaving the run.
              </p>
            </div>
            <StatusBadge tone={isConnected || isTerminalStatus(currentStatus) ? "success" : "warning"}>
              {isConnected || isTerminalStatus(currentStatus) ? "live" : "reconnecting"}
            </StatusBadge>
          </div>
          <div className="mt-4">
            <ExecutionLogStream events={events} />
          </div>
        </div>
      </section>
    </div>
  );
}
