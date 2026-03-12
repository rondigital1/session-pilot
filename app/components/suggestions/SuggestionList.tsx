"use client";

import Link from "next/link";
import AsyncState from "@/app/components/orchestrator/AsyncState";
import StatusBadge, { toneForScore } from "@/app/components/orchestrator/StatusBadge";
import { APP_ROUTES } from "@/app/utils/api-routes";
import type { SuggestionRecord } from "@/server/types/domain";

function autonomyTone(mode: SuggestionRecord["autonomyMode"]): "info" | "warning" | "neutral" {
  switch (mode) {
    case "safe_auto":
      return "info";
    case "guided":
      return "warning";
    default:
      return "neutral";
  }
}

export default function SuggestionList({ suggestions }: { suggestions: SuggestionRecord[] }) {
  if (suggestions.length === 0) {
    return (
      <AsyncState
        tone="empty"
        title="No ranked suggestions yet"
        description="Run analysis to generate a grounded improvement backlog for this repository."
      />
    );
  }

  return (
    <div className="space-y-4">
      {suggestions.map((suggestion, index) => (
        <Link
          key={suggestion.id}
          href={APP_ROUTES.suggestion(suggestion.id)}
          className="block rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Rank #{index + 1} · {suggestion.category}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">{suggestion.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{suggestion.summary}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge tone={toneForScore(suggestion.impactScore)}>
                Impact {suggestion.impactScore}/10
              </StatusBadge>
              <StatusBadge tone={autonomyTone(suggestion.autonomyMode)}>
                {suggestion.autonomyMode.replaceAll("_", " ")}
              </StatusBadge>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Priority {suggestion.priorityScore.toFixed(1)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Effort {suggestion.effortScore}/10
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Risk {suggestion.riskScore}/10
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Confidence {suggestion.confidenceScore}/10
            </span>
          </div>

          {suggestion.evidence.length > 0 ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {suggestion.evidence.slice(0, 4).map((item) => (
                <div
                  key={`${suggestion.id}-${item.label}`}
                  className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600"
                >
                  <div className="font-medium text-slate-900">{item.label}</div>
                  <div className="mt-1">{item.detail}</div>
                  {item.filePath ? (
                    <div className="mt-2 font-mono text-xs text-slate-500">{item.filePath}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {suggestion.likelyFiles.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestion.likelyFiles.slice(0, 5).map((filePath) => (
                <span
                  key={filePath}
                  className="rounded-full border border-slate-200 px-3 py-1 font-mono text-xs text-slate-600"
                >
                  {filePath}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 text-sm font-semibold text-sky-700">Open suggestion →</div>
        </Link>
      ))}
    </div>
  );
}
