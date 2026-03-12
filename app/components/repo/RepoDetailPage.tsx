"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncState from "@/app/components/orchestrator/AsyncState";
import StatusBadge, {
  toneForBooleanState,
  toneForExecutionStatus,
} from "@/app/components/orchestrator/StatusBadge";
import SuggestionList from "@/app/components/suggestions/SuggestionList";
import { APP_ROUTES } from "@/app/utils/api-routes";
import {
  fetchRepositoryDetail,
  orchestratorQueryKeys,
  triggerAnalysis,
} from "@/app/utils/orchestrator-client";
import type { FindingSeverity } from "@/server/types/domain";

function formatTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function severityTone(severity: FindingSeverity): "neutral" | "warning" | "danger" {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    default:
      return "neutral";
  }
}

const FLOW_STEPS = [
  "Deep analysis",
  "Review findings",
  "Choose suggestion",
  "Launch execution",
];

export default function RepoDetailPage({ repositoryId }: { repositoryId: string }) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: orchestratorQueryKeys.repository(repositoryId),
    queryFn: () => fetchRepositoryDetail(repositoryId),
  });
  const analysisMutation = useMutation({
    mutationFn: () => triggerAnalysis(repositoryId),
    onSuccess: (payload) => {
      queryClient.setQueryData(orchestratorQueryKeys.repository(repositoryId), payload);
      void queryClient.invalidateQueries({ queryKey: orchestratorQueryKeys.repositories() });
    },
  });

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Link href={APP_ROUTES.inventory} className="text-sm font-medium text-sky-700">
          ← Back to inventory
        </Link>
        <AsyncState
          tone="loading"
          title="Loading repository"
          description="Gathering the latest analysis, ranked suggestions, and execution history for this repo."
        />
      </div>
    );
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Link href={APP_ROUTES.inventory} className="text-sm font-medium text-sky-700">
          ← Back to inventory
        </Link>
        <AsyncState
          tone="error"
          title="Repository unavailable"
          description={(detailQuery.error as Error | null)?.message ?? "Repository not found"}
          action={
            <button
              type="button"
              onClick={() => {
                void detailQuery.refetch();
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

  const { repository, analysis, suggestions, executions } = detailQuery.data;
  const executionHistory = executions.toSorted(
    (left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
  );
  const topFindings = analysis?.findings.slice(0, 4) ?? [];
  const validationPlan = analysis?.profile.validationCommands ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={APP_ROUTES.inventory}
            className="text-sm font-medium text-sky-700 transition hover:text-sky-900"
          >
            ← Back to inventory
          </Link>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            {repository.name}
          </h1>
          <p className="mt-2 font-mono text-sm text-slate-500">{repository.path}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone={toneForBooleanState(repository.isDirty)}>
              {repository.isDirty ? "Dirty checkout" : "Clean checkout"}
            </StatusBadge>
            <StatusBadge tone={analysis ? "info" : "neutral"}>
              {analysis ? "Analysis ready" : "Awaiting analysis"}
            </StatusBadge>
            <StatusBadge>{suggestions.length} ranked suggestions</StatusBadge>
            <StatusBadge>{executionHistory.length} execution runs</StatusBadge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {executionHistory[0] ? (
            <Link
              href={APP_ROUTES.run(executionHistory[0].id)}
              className="rounded-full border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              View latest run
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => analysisMutation.mutate()}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={analysisMutation.isPending}
          >
            {analysisMutation.isPending
              ? "Analyzing repository..."
              : analysis
                ? "Refresh analysis"
                : "Run deep analysis"}
          </button>
        </div>
      </div>

      {analysisMutation.error ? (
        <AsyncState
          tone="error"
          title="Analysis failed"
          description={(analysisMutation.error as Error).message}
          className="shadow-none"
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {FLOW_STEPS.map((step, index) => {
          const isComplete =
            (index === 0 && Boolean(analysis)) ||
            (index === 1 && topFindings.length > 0) ||
            (index === 2 && suggestions.length > 0) ||
            (index === 3 && executionHistory.length > 0);

          return (
            <div
              key={step}
              className={`rounded-[1.5rem] border p-4 shadow-sm ${
                isComplete
                  ? "border-sky-200 bg-sky-50"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Step {index + 1}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{step}</div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                Analysis
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Repo profile and findings</h2>
            </div>
            {detailQuery.isFetching ? <StatusBadge tone="info">Refreshing</StatusBadge> : null}
          </div>

          {analysis ? (
            <>
              <p className="mt-4 text-sm leading-7 text-slate-600">{analysis.summary}</p>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Findings</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {analysis.findings.length}
                  </div>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Files</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {analysis.profile.fileCount}
                  </div>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Lines</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {analysis.profile.lineCount}
                  </div>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Validation steps
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {validationPlan.length}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Stack</div>
                  <div className="mt-2 text-sm text-slate-700">
                    {analysis.profile.stackTags.join(", ") || "No stack tags detected"}
                  </div>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Tooling</div>
                  <div className="mt-2 text-sm text-slate-700">
                    {analysis.profile.frameworks.join(", ") || "No framework hints detected"}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Top grounded findings
                </div>
                <div className="mt-3 space-y-3">
                  {topFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{finding.title}</div>
                          <p className="mt-2 text-sm text-slate-600">{finding.summary}</p>
                        </div>
                        <StatusBadge tone={severityTone(finding.severity)}>
                          {finding.severity}
                        </StatusBadge>
                      </div>
                      {finding.evidence.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {finding.evidence.slice(0, 3).map((item) => (
                            <span
                              key={`${finding.id}-${item.label}`}
                              className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
                            >
                              {item.label}: {item.detail}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <AsyncState
                tone="empty"
                title="Analysis has not been run yet"
                description="Run deep analysis to fingerprint the repo, infer validation commands, and generate a grounded improvement backlog."
                action={
                  <button
                    type="button"
                    onClick={() => analysisMutation.mutate()}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Run deep analysis
                  </button>
                }
                className="shadow-none"
              />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Repo state
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Branches</div>
                <div className="mt-1">
                  {repository.currentBranch ?? "Unknown"} → {repository.defaultBranch ?? "Unknown"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Remote</div>
                <div className="mt-1 break-all">
                  {repository.remoteOrigin ?? "No origin detected"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Last analysis
                </div>
                <div className="mt-1">{formatTimestamp(repository.lastAnalyzedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Validation plan
                </div>
                <div className="mt-2 space-y-2">
                  {validationPlan.length > 0 ? (
                    validationPlan.map((command) => (
                      <div
                        key={command.join(" ")}
                        className="rounded-2xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                      >
                        {command.join(" ")}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      Validation commands will appear after analysis.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                Recent executions
              </p>
              {executionHistory[0] ? (
                <StatusBadge tone={toneForExecutionStatus(executionHistory[0].status)}>
                  {executionHistory[0].status}
                </StatusBadge>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {executionHistory.slice(0, 5).map((execution) => (
                <Link
                  key={execution.id}
                  href={APP_ROUTES.run(execution.id)}
                  className="block rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">
                      {formatTimestamp(execution.startedAt)}
                    </div>
                    <StatusBadge tone={toneForExecutionStatus(execution.status)}>
                      {execution.status}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {execution.branchName ?? "Branch pending"} ·{" "}
                    {execution.worktreePath ?? "Worktree pending"}
                  </div>
                </Link>
              ))}
              {executionHistory.length === 0 ? (
                <AsyncState
                  tone="empty"
                  title="No execution history yet"
                  description="Once you launch a suggestion with Codex, the run will appear here for review."
                  className="shadow-none"
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Ranked suggestions
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Improvement backlog for this repository
            </h2>
          </div>
          {suggestions[0] ? (
            <Link
              href={APP_ROUTES.suggestion(suggestions[0].id)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Open top suggestion
            </Link>
          ) : null}
        </div>

        {analysis && suggestions.length === 0 ? (
          <AsyncState
            tone="empty"
            title="No ranked suggestions were produced"
            description="The repo analysis completed, but no bounded improvement suggestion was stored. This likely needs a backend scoring pass rather than a UI change."
          />
        ) : (
          <SuggestionList suggestions={suggestions} />
        )}
      </section>
    </div>
  );
}
