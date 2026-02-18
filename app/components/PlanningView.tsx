interface PlanningViewProps {
  events: string[];
  isLoading: boolean;
  errorMessage?: string | null;
  onCancel?: () => void;
}

export default function PlanningView({
  events,
  isLoading,
  errorMessage,
  onCancel,
}: PlanningViewProps) {
  return (
    <div className="panel">
      <div className="panel-header row">
        <div>
          <h2>Planning session</h2>
          <p>Scanning code, issues, and TODOs.</p>
        </div>
        <span
          className={`badge ${
            isLoading
              ? "badge-active"
              : errorMessage
                ? "badge-danger"
                : "badge-muted"
          }`}
        >
          {isLoading ? "Scanning" : errorMessage ? "Error" : "Queued"}
        </span>
      </div>

      <div className={`progress-bar ${isLoading ? "is-loading" : "is-idle"}`}>
        <div
          className={`progress-fill ${isLoading ? "" : "progress-fill-paused"}`}
        />
      </div>

      {errorMessage && (
        <div className="planning-error" role="alert">
          <p>Planning failed</p>
          <pre>{errorMessage}</pre>
        </div>
      )}

      <div className="events-log">
        {events.length === 0 ? (
          <div className="event-item">Connecting to session...</div>
        ) : (
          events.map((event, i) => (
            <div
              key={i}
              className={`event-item ${event.includes("Error:") ? "event-item-error" : ""}`}
            >
              {event}
            </div>
          ))
        )}
      </div>

      {onCancel && (
        <div className="planning-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {isLoading ? "Cancel" : "Back to start"}
          </button>
        </div>
      )}
    </div>
  );
}
