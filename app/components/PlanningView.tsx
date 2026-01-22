interface PlanningViewProps {
  events: string[];
  isLoading: boolean;
  onCancel?: () => void;
}

export default function PlanningView({ events, isLoading, onCancel }: PlanningViewProps) {
  return (
    <div className="panel">
      <div className="panel-header row">
        <div>
          <h2>Planning session</h2>
          <p>Scanning code, issues, and TODOs.</p>
        </div>
        <span className={`badge ${isLoading ? "badge-active" : "badge-muted"}`}>
          {isLoading ? "Scanning" : "Queued"}
        </span>
      </div>

      {isLoading && (
        <div className="progress-bar">
          <div className="progress-fill" />
        </div>
      )}

      <div className="events-log">
        {events.length === 0 ? (
          <div className="event-item">Connecting to session...</div>
        ) : (
          events.map((event, i) => (
            <div key={i} className="event-item">
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
            disabled={!isLoading}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
