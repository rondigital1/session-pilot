import type { ReactNode } from "react";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

export function toneForExecutionStatus(status: string): StatusTone {
  switch (status) {
    case "completed":
      return "success";
    case "running":
    case "validating":
    case "preparing":
      return "info";
    case "queued":
      return "neutral";
    case "failed":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function toneForBooleanState(value: boolean): StatusTone {
  return value ? "warning" : "success";
}

export function toneForScore(score: number): StatusTone {
  if (score >= 8) {
    return "success";
  }

  if (score >= 5) {
    return "warning";
  }

  return "neutral";
}

export default function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
