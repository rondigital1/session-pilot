"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncState from "@/app/components/orchestrator/AsyncState";
import StatusBadge, {
  toneForBooleanState,
} from "@/app/components/orchestrator/StatusBadge";
import {
  fetchRepoRoots,
  fetchRepositories,
  orchestratorQueryKeys,
  triggerDiscovery,
} from "@/app/utils/orchestrator-client";
import RepoRootManager from "./RepoRootManager";
import RepoCard from "./RepoCard";

export default function RepoInventoryPage() {
  const queryClient = useQueryClient();
  const rootsQuery = useQuery({
    queryKey: orchestratorQueryKeys.repoRoots(),
    queryFn: fetchRepoRoots,
  });
  const repositoriesQuery = useQuery({
    queryKey: orchestratorQueryKeys.repositories(),
    queryFn: fetchRepositories,
  });
  const discoveryMutation = useMutation({
    mutationFn: triggerDiscovery,
    onSuccess: (repositories) => {
      queryClient.setQueryData(orchestratorQueryKeys.repositories(), repositories);
    },
  });

  const roots = rootsQuery.data ?? [];
  const repositories = (repositoriesQuery.data ?? []).toSorted((left, right) => {
    const leftRank = left.lastAnalysisRunId ? 0 : 1;
    const rightRank = right.lastAnalysisRunId ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.name.localeCompare(right.name);
  });
  const analyzedCount = repositories.filter((repository) => repository.lastAnalysisRunId).length;
  const dirtyCount = repositories.filter((repository) => repository.isDirty).length;
  const inventoryError =
    (repositoriesQuery.error as Error | null)?.message ??
    (discoveryMutation.error as Error | null)?.message ??
    null;
  const rootsReady = roots.length > 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_40%),linear-gradient(135deg,#ffffff,#f8fafc)] p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-sky-700">
          SessionPilot
        </p>
        <div className="mt-4 max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Local repo improvement control center
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Discover repositories, analyze one deeply, rank concrete improvements, generate a bounded task, and execute it through a local coding agent with safe git isolation.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => discoveryMutation.mutate()}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={discoveryMutation.isPending || !rootsReady}
          >
            {discoveryMutation.isPending ? "Scanning roots..." : "Discover repositories"}
          </button>
          <StatusBadge>{repositories.length} repos in inventory</StatusBadge>
          {rootsReady ? (
            <StatusBadge tone={toneForBooleanState(dirtyCount > 0)}>
              {dirtyCount} dirty checkout{dirtyCount === 1 ? "" : "s"}
            </StatusBadge>
          ) : null}
          {analyzedCount > 0 ? (
            <StatusBadge tone="info">
              {analyzedCount} analyzed repo{analyzedCount === 1 ? "" : "s"}
            </StatusBadge>
          ) : null}
        </div>

        <div className="mt-6 max-w-3xl rounded-[1.75rem] bg-white/75 p-5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/70">
          <div className="font-semibold text-slate-900">Demo flow</div>
          <p className="mt-2">
            Register roots, discover repositories, open a repo, run analysis, inspect one ranked
            suggestion, launch it with Codex, then review the isolated execution and validation
            result.
          </p>
        </div>
      </section>

      <RepoRootManager
        roots={roots}
        isLoading={rootsQuery.isPending}
        errorMessage={(rootsQuery.error as Error | null)?.message ?? null}
        onRetry={() => {
          void rootsQuery.refetch();
        }}
      />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
              Repository Inventory
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Choose a repo to analyze</h2>
          </div>
          {repositoriesQuery.isFetching && repositories.length > 0 ? (
            <StatusBadge tone="info">Refreshing inventory</StatusBadge>
          ) : null}
        </div>

        {inventoryError ? (
          <AsyncState
            tone="error"
            title="Repository inventory unavailable"
            description={inventoryError}
            action={
              <>
                <button
                  type="button"
                  onClick={() => {
                    void repositoriesQuery.refetch();
                  }}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Retry inventory
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void rootsQuery.refetch();
                  }}
                  className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Reload roots
                </button>
              </>
            }
          />
        ) : repositoriesQuery.isPending ? (
          <AsyncState
            tone="loading"
            title="Loading repository inventory"
            description="Reading the current repository list so you can choose the next repo to analyze."
          />
        ) : repositories.length === 0 ? (
          <AsyncState
            tone="empty"
            title={rootsReady ? "No repositories discovered yet" : "Add a repo root first"}
            description={
              rootsReady
                ? "Your roots are configured. Run discovery to populate the inventory from local source folders."
                : "SessionPilot needs at least one allowed root folder before it can scan for repositories."
            }
            action={
              rootsReady ? (
                <button
                  type="button"
                  onClick={() => discoveryMutation.mutate()}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Discover repositories
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {repositories.map((repository) => (
              <RepoCard key={repository.id} repository={repository} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
