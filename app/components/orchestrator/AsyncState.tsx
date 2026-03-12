import type { ReactNode } from "react";

type AsyncStateTone = "loading" | "empty" | "error";

const TONE_STYLES: Record<AsyncStateTone, string> = {
  loading: "border-slate-200 bg-white text-slate-700",
  empty: "border-dashed border-slate-300 bg-slate-50 text-slate-600",
  error: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function AsyncState({
  tone,
  title,
  description,
  action,
  className = "",
}: {
  tone: AsyncStateTone;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[1.75rem] border p-6 shadow-sm ${TONE_STYLES[tone]} ${className}`}>
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-2 text-sm leading-6">{description}</p>
      </div>
      {action ? <div className="mt-4 flex flex-wrap gap-3">{action}</div> : null}
    </div>
  );
}
