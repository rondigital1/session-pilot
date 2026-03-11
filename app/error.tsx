"use client";

import Link from "next/link";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <div className="shell">
      <main className="shell-main">
        <section className="panel empty-state">
          <p className="eyebrow">Application error</p>
          <h1>SessionPilot hit an unexpected error</h1>
          <p className="text-muted">
            {error.message || "Something went wrong while loading this screen."}
          </p>
          {error.digest && (
            <p className="form-hint">Error reference: {error.digest}</p>
          )}
          <div className="selection-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Retry
            </button>
            <Link className="btn btn-outline" href="/">
              Return home
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
