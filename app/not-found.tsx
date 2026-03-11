import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell">
      <main className="shell-main">
        <section className="panel empty-state">
          <p className="eyebrow">Not found</p>
          <h1>This screen doesn't exist</h1>
          <p className="text-muted">
            Head back to the main session view to continue planning or working.
          </p>
          <Link className="btn btn-primary" href="/">
            Return home
          </Link>
        </section>
      </main>
    </div>
  );
}
