"use client";

import Link from "next/link";
import type { RepositoryInventoryItem } from "@/server/types/domain";

export default function RepoCard({ repository }: { repository: RepositoryInventoryItem }) {
  return (
    <Link
      href={`/repos/${repository.id}`}
      className="group flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Repository
          </p>
          <h3 className="text-lg font-semibold text-slate-900">{repository.name}</h3>
          <p className="font-mono text-xs text-slate-500">{repository.path}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            repository.isDirty
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {repository.isDirty ? "Dirty checkout" : "Clean checkout"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Branch</div>
          <div className="mt-1 font-medium text-slate-900">
            {repository.currentBranch ?? "Unknown"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Last analysis</div>
          <div className="mt-1 font-medium text-slate-900">
            {repository.lastAnalyzedAt
              ? new Date(repository.lastAnalyzedAt).toLocaleString()
              : "Not analyzed"}
          </div>
        </div>
      </div>
    </Link>
  );
}
