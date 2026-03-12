"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import AsyncState from "@/app/components/orchestrator/AsyncState";
import StatusBadge, { toneForScore } from "@/app/components/orchestrator/StatusBadge";
import { APP_ROUTES } from "@/app/utils/api-routes";
import {
  CODEX_PROVIDER,
  createExecution,
  fetchSuggestion,
  fetchTaskBundle,
  orchestratorQueryKeys,
} from "@/app/utils/orchestrator-client";

function autonomyTone(mode: string): "info" | "warning" | "neutral" {
  switch (mode) {
    case "safe_auto":
      return "info";
    case "guided":
      return "warning";
    default:
      return "neutral";
  }
}

export default function SuggestionDetailPage({ suggestionId }: { suggestionId: string }) {
  const router = useRouter();
  const suggestionQuery = useQuery({
    queryKey: orchestratorQueryKeys.suggestion(suggestionId),
    queryFn: () => fetchSuggestion(suggestionId),
  });
  const taskQuery = useQuery({
    queryKey: orchestratorQueryKeys.suggestionTask(suggestionId),
    queryFn: () => fetchTaskBundle(suggestionId),
  });
  const executionMutation = useMutation({
    mutationFn: () => createExecution(suggestionId),
    onSuccess: (execution) => {
      startTransition(() => {
        router.push(APP_ROUTES.run(execution.id));
      });
    },
  });

  if (suggestionQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Link href={APP_ROUTES.inventory} className="text-sm font-medium text-sky-700">
          ← Back to inventory
        </Link>
        <AsyncState
          tone="loading"
          title="Loading suggestion"
          description="Reading the ranked suggestion and preparing the executable task bundle."
        />
      </div>
    );
  }

  if (suggestionQuery.error || !suggestionQuery.data) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Link href={APP_ROUTES.inventory} className="text-sm font-medium text-sky-700">
          ← Back to inventory
        </Link>
        <AsyncState
          tone="error"
          title="Suggestion unavailable"
          description={(suggestionQuery.error as Error | null)?.message ?? "Suggestion not found"}
          action={
            <button
              type="button"
              onClick={() => {
                void suggestionQuery.refetch();
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

  const { suggestion, repository, analysis } = suggestionQuery.data;
  const taskBundle = taskQuery.data;
  const taskSpec = taskBundle?.taskSpec;
  const prompt = taskBundle?.prompt;
  const executeDisabled = executionMutation.isPending || taskQuery.isPending || Boolean(taskQuery.error);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={APP_ROUTES.repository(repository.id)}
            className="text-sm font-medium text-sky-700 hover:text-sky-900"
          >
            ← Back to repository
          </Link>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            {suggestion.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{suggestion.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone={toneForScore(suggestion.impactScore)}>
              Impact {suggestion.impactScore}/10
            </StatusBadge>
            <StatusBadge tone={autonomyTone(suggestion.autonomyMode)}>
              {suggestion.autonomyMode.replaceAll("_", " ")}
            </StatusBadge>
            <StatusBadge tone="info">{CODEX_PROVIDER.label} only</StatusBadge>
            <StatusBadge>{suggestion.category}</StatusBadge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={APP_ROUTES.repository(repository.id)}
            className="rounded-full border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            View repo context
          </Link>
          <button
            type="button"
            onClick={() => executionMutation.mutate()}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={executeDisabled}
          >
            {executionMutation.isPending
              ? "Launching Codex..."
              : taskQuery.isPending
                ? "Preparing task bundle..."
                : "Execute with Codex"}
          </button>
        </div>
      </div>

      {executionMutation.error ? (
        <AsyncState
          tone="error"
          title="Execution could not be created"
          description={(executionMutation.error as Error).message}
          className="shadow-none"
        />
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Suggestion grounding
            </p>
            <div className="mt-4 space-y-5 text-sm text-slate-700">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Repository</div>
                <div className="mt-2">
                  <div className="font-semibold text-slate-900">{repository.name}</div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{repository.path}</div>
                </div>
              </div>
              {analysis ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Analysis summary
                  </div>
                  <p className="mt-2 leading-6 text-slate-600">{analysis.summary}</p>
                </div>
              ) : null}
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Evidence</div>
                <div className="mt-2 space-y-3">
                  {suggestion.evidence.map((item) => (
                    <div key={`${suggestion.id}-${item.label}`} className="rounded-2xl bg-slate-50 p-4">
                      <div className="font-medium text-slate-900">{item.label}</div>
                      <p className="mt-2 leading-6 text-slate-600">{item.detail}</p>
                      {item.filePath ? (
                        <div className="mt-3 font-mono text-xs text-slate-500">{item.filePath}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Likely files</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestion.likelyFiles.length > 0 ? (
                    suggestion.likelyFiles.map((filePath) => (
                      <span
                        key={filePath}
                        className="rounded-full border border-slate-200 px-3 py-1 font-mono text-xs text-slate-600"
                      >
                        {filePath}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                      No likely files were inferred
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Execution readiness
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-900">Provider</div>
                <div className="mt-1 text-slate-600">{CODEX_PROVIDER.label}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-900">Priority</div>
                <div className="mt-1 text-slate-600">
                  Priority {suggestion.priorityScore.toFixed(1)} · effort {suggestion.effortScore}/10
                  · risk {suggestion.riskScore}/10
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-900">What happens next</div>
                <div className="mt-1 text-slate-600">
                  SessionPilot creates a bounded task, launches Codex in an isolated git worktree,
                  and streams logs plus validation results on the run page.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Task bundle
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Executable plan for Codex
                </h2>
              </div>
              {taskQuery.isFetching && !taskQuery.isPending ? (
                <StatusBadge tone="info">Refreshing</StatusBadge>
              ) : null}
            </div>

            {taskQuery.isPending ? (
              <div className="mt-4">
                <AsyncState
                  tone="loading"
                  title="Generating task spec"
                  description="Preparing the problem statement, acceptance criteria, validation commands, and execution prompt."
                  className="shadow-none"
                />
              </div>
            ) : taskQuery.error || !taskSpec || !prompt ? (
              <div className="mt-4">
                <AsyncState
                  tone="error"
                  title="Task bundle unavailable"
                  description={(taskQuery.error as Error | null)?.message ?? "Task bundle missing"}
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        void taskQuery.refetch();
                      }}
                      className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                    >
                      Retry
                    </button>
                  }
                  className="shadow-none"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-5 text-sm text-slate-700">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Problem</div>
                  <p className="mt-2 leading-6">{taskSpec.problem}</p>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Goal</div>
                  <p className="mt-2 leading-6">{taskSpec.goal}</p>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Acceptance criteria
                  </div>
                  <ul className="mt-2 space-y-2">
                    {taskSpec.acceptanceCriteria.map((item) => (
                      <li key={item} className="rounded-2xl bg-slate-50 px-3 py-3">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Implementation plan
                  </div>
                  <ul className="mt-2 space-y-2">
                    {taskSpec.implementationPlan.map((step) => (
                      <li key={step} className="rounded-2xl bg-slate-50 px-3 py-3">
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Validation commands
                    </div>
                    <ul className="mt-2 space-y-2">
                      {taskSpec.validationCommands.map((command) => (
                        <li
                          key={command.join(" ")}
                          className="rounded-2xl bg-slate-50 px-3 py-3 font-mono text-xs"
                        >
                          {command.join(" ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Risks</div>
                    <ul className="mt-2 space-y-2">
                      {taskSpec.risks.map((risk) => (
                        <li key={risk} className="rounded-2xl bg-slate-50 px-3 py-3">
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {taskSpec.nonGoals.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Non-goals</div>
                    <ul className="mt-2 space-y-2">
                      {taskSpec.nonGoals.map((item) => (
                        <li key={item} className="rounded-2xl bg-slate-50 px-3 py-3">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Execution prompt
            </p>
            {prompt ? (
              <pre className="mt-4 max-h-[32rem] overflow-auto rounded-[1.5rem] bg-slate-950 p-5 text-xs leading-6 text-slate-100">
                {prompt.prompt}
              </pre>
            ) : (
              <div className="mt-4">
                <AsyncState
                  tone="loading"
                  title="Prompt pending"
                  description="The final provider prompt appears once the task bundle finishes generating."
                  className="shadow-none"
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
