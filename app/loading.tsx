export default function Loading() {
  return (
    <div className="shell">
      <main className="shell-main">
        <section className="panel">
          <div className="panel-header">
            <p className="eyebrow">Loading</p>
            <h2>Preparing SessionPilot</h2>
            <p>Loading your workspace context and session state.</p>
          </div>
          <div className="progress-bar is-loading">
            <div className="progress-fill" />
          </div>
        </section>
      </main>
    </div>
  );
}
