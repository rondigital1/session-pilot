"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import AsyncState from "@/app/components/orchestrator/AsyncState";
import StatusBadge from "@/app/components/orchestrator/StatusBadge";
import {
  createRepoRoot,
  deleteRepoRoot,
  orchestratorQueryKeys,
} from "@/app/utils/orchestrator-client";
import type { RepoRootRecord } from "@/server/types/domain";

export default function RepoRootManager({
  roots,
  isLoading,
  errorMessage,
  onRetry,
}: {
  roots: RepoRootRecord[];
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createRepoRoot,
    onSuccess: () => {
      setLabel("");
      setPath("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: orchestratorQueryKeys.repoRoots() });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Failed to add root");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRepoRoot,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orchestratorQueryKeys.repoRoots() });
      void queryClient.invalidateQueries({ queryKey: orchestratorQueryKeys.repositories() });
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Failed to delete root");
    },
  });

  const isSubmitting = createMutation.isPending;
  const isFormInvalid = !label.trim() || !path.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    createMutation.mutate({
      label: label.trim(),
      path: path.trim(),
    });
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
            Repo Roots
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Configure local source roots
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Inventory only works after you register local root folders. SessionPilot scans inside
            those roots and never executes directly against the source checkout.
          </p>
        </div>
        <StatusBadge>{roots.length} configured</StatusBadge>
      </div>

      <form className="mt-6 grid gap-3 md:grid-cols-[0.9fr_1.4fr_auto]" onSubmit={handleSubmit}>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="/Users/you/code"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-900 outline-none transition focus:border-slate-400"
        />
        <button
          type="submit"
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSubmitting || isFormInvalid}
        >
          {isSubmitting ? "Adding..." : "Add root"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      {errorMessage ? (
        <div className="mt-4">
          <AsyncState
            tone="error"
            title="Root inventory failed to load"
            description={errorMessage}
            action={
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Retry
              </button>
            }
            className="shadow-none"
          />
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <AsyncState
            tone="loading"
            title="Loading repo roots"
            description="Reading configured source roots so discovery can scan the right folders."
            className="shadow-none"
          />
        ) : roots.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Add one or more local roots such as <span className="font-mono">~/code</span> or{" "}
            <span className="font-mono">~/projects</span> to start repo discovery.
          </div>
        ) : (
          roots.map((root) => (
            <div
              key={root.id}
              className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{root.label}</div>
                <div className="font-mono text-xs text-slate-500">{root.path}</div>
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(root.id)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-rose-300 hover:text-rose-700"
                disabled={deleteMutation.isPending}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
