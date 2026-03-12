"use client";

import { useEffect, useRef, useState } from "react";
import StatusBadge, {
  toneForExecutionStatus,
} from "@/app/components/orchestrator/StatusBadge";
import type { ExecutionEventRecord, ValidationCommandResult } from "@/server/types/domain";

type LogFilter = "all" | "milestones" | "stdout" | "stderr";

function eventTone(
  event: ExecutionEventRecord
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (event.type) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "stderr":
      return "warning";
    case "status":
      return toneForExecutionStatus(
        typeof event.data === "object" && event.data !== null && "status" in event.data
          ? String((event.data as { status?: string }).status ?? "")
          : ""
      );
    default:
      return "info";
  }
}

function shouldIncludeEvent(filter: LogFilter, event: ExecutionEventRecord): boolean {
  switch (filter) {
    case "milestones":
      return (
        event.type === "status" ||
        event.type === "agent_event" ||
        event.type === "validation_started" ||
        event.type === "validation_result" ||
        event.type === "completed" ||
        event.type === "failed" ||
        event.type === "cancelled"
      );
    case "stdout":
      return event.type === "stdout";
    case "stderr":
      return event.type === "stderr";
    default:
      return true;
  }
}

function stringifyData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data === null || data === undefined) {
    return "";
  }

  return JSON.stringify(data, null, 2);
}

function renderPrimaryLine(event: ExecutionEventRecord): string {
  if (typeof event.data === "object" && event.data !== null) {
    if ("line" in event.data && typeof event.data.line === "string") {
      return event.data.line;
    }

    if ("message" in event.data && typeof event.data.message === "string") {
      return event.data.message;
    }
  }

  return stringifyData(event.data);
}

function renderSecondaryLine(event: ExecutionEventRecord): string | null {
  if (event.type === "validation_result" && typeof event.data === "object" && event.data !== null) {
    const result = event.data as ValidationCommandResult;
    return `exit ${result.exitCode} in ${result.durationMs}ms`;
  }

  if (event.type === "status" && typeof event.data === "object" && event.data !== null) {
    const details = [
      "status" in event.data && event.data.status ? `status ${String(event.data.status)}` : null,
      "branchName" in event.data && event.data.branchName
        ? `branch ${String(event.data.branchName)}`
        : null,
      "worktreePath" in event.data && event.data.worktreePath
        ? `worktree ${String(event.data.worktreePath)}`
        : null,
    ].filter(Boolean);

    return details.length > 0 ? details.join(" · ") : null;
  }

  return null;
}

function renderSupplementalBlock(event: ExecutionEventRecord): string | null {
  if (event.type === "validation_result" && typeof event.data === "object" && event.data !== null) {
    const result = event.data as ValidationCommandResult;
    const lines = [
      `command: ${result.command.join(" ")}`,
      result.stdout ? `stdout:\n${result.stdout}` : null,
      result.stderr ? `stderr:\n${result.stderr}` : null,
    ].filter(Boolean);

    return lines.join("\n\n");
  }

  if (
    event.type === "agent_event" ||
    event.type === "log" ||
    (typeof event.data === "object" &&
      event.data !== null &&
      !("line" in event.data) &&
      !("message" in event.data))
  ) {
    return stringifyData(event.data);
  }

  return null;
}

export default function ExecutionLogStream({ events }: { events: ExecutionEventRecord[] }) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [followLogs, setFollowLogs] = useState(true);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const filteredEvents = events.filter((event) => shouldIncludeEvent(filter, event));

  useEffect(() => {
    if (!followLogs || !viewportRef.current) {
      return;
    }

    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [filteredEvents.length, followLogs]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "milestones", "stdout", "stderr"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === value
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFollowLogs((current) => !current)}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {followLogs ? "Following live output" : "Follow newest output"}
        </button>
      </div>

      <div
        ref={viewportRef}
        className="max-h-[36rem] overflow-auto rounded-[1.5rem] bg-slate-950 p-4 text-xs text-slate-100"
      >
        <div className="space-y-3 font-mono">
          {filteredEvents.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-slate-400">
              {events.length === 0
                ? "Waiting for execution events…"
                : "No events match the current filter."}
            </div>
          ) : (
            filteredEvents.map((event) => {
              const secondaryLine = renderSecondaryLine(event);
              const supplementalBlock = renderSupplementalBlock(event);

              return (
                <div
                  key={`${event.id}-${event.timestamp}`}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={eventTone(event)}>{event.type}</StatusBadge>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">#{event.id}</span>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap break-words text-slate-100">
                    {renderPrimaryLine(event)}
                  </div>
                  {secondaryLine ? (
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      {secondaryLine}
                    </div>
                  ) : null}
                  {supplementalBlock ? (
                    <pre className="mt-3 overflow-x-auto rounded-xl bg-black/20 p-3 whitespace-pre-wrap break-words text-slate-300">
                      {supplementalBlock}
                    </pre>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
