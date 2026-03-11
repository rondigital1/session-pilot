"use client";

import { useState, useEffect, useCallback } from "react";
import type { UIWorkspace } from "@/server/types/domain";
import InlineMessage from "./InlineMessage";

// =============================================================================
// Types
// =============================================================================

interface IdeaEvidence {
  signalKey: string;
  detail: string;
}

interface IdeaItem {
  id: string;
  title: string;
  category: string;
  impact: string;
  effort: string;
  risk: string;
  confidence: number;
  score: number;
  evidence: IdeaEvidence[];
  acceptanceCriteria: string[];
  steps: string[];
  status: string;
  createdAt: string;
}

interface ImproveViewProps {
  workspaces: UIWorkspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onStartSessionWithIdea: (steps: string[], title: string) => boolean;
}

type TabFilter = "top3" | "week" | "backlog";

// =============================================================================
// Helpers
// =============================================================================

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    testing: "Testing",
    ci_cd: "CI/CD",
    documentation: "Docs",
    types: "Types",
    performance: "Perf",
    security: "Security",
    code_quality: "Quality",
    developer_experience: "DX",
    architecture: "Arch",
  };
  return labels[cat] ?? cat;
}

function impactColor(impact: string): string {
  if (impact === "high") {
    return "badge-active";
  }
  if (impact === "medium") {
    return "badge";
  }
  return "badge-muted";
}

function isThisWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo;
}

// =============================================================================
// Component
// =============================================================================

export default function ImproveView({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onStartSessionWithIdea,
}: ImproveViewProps) {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("top3");
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    if (!selectedWorkspaceId) {
      setIdeas([]);
      setError(null);
      setFeedbackMessage(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/improve`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch improvements");
      }
      setIdeas(data.ideas ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      void fetchLatest();
    }
  }, [selectedWorkspaceId, fetchLatest]);

  useEffect(() => {
    setExpandedIdeaId(null);
  }, [activeTab, selectedWorkspaceId]);

  async function handleRunScan() {
    if (!selectedWorkspaceId) {
      return;
    }
    setIsScanning(true);
    setError(null);
    setFeedbackMessage(null);
    try {
      const res = await fetch(
        `/api/workspaces/${selectedWorkspaceId}/improve?force=1`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Scan failed");
      }
      setIdeas(data.ideas ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleFeedback(ideaId: string, vote: "up" | "down") {
    try {
      setFeedbackMessage(null);
      const res = await fetch(`/api/improvement-ideas/${ideaId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      if (!res.ok) {
        throw new Error("Feedback failed");
      }
      // Update local state
      setIdeas((prev) =>
        prev.map((idea) => {
          if (idea.id === ideaId) {
            return {
              ...idea,
              status: vote === "down" ? "rejected" : "accepted",
            };
          }
          return idea;
        })
      );
      setFeedbackMessage(
        vote === "up"
          ? "Marked as helpful. SessionPilot will keep this idea surfaced."
          : "Marked as not useful. It will be deprioritized from the active list."
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Feedback failed";
      console.error("Feedback error:", err);
      setError(message);
    }
  }

  function toggleExpand(ideaId: string) {
    setExpandedIdeaId((prev) => (prev === ideaId ? null : ideaId));
  }

  function handleUseIdeaAsDraft(steps: string[], title: string) {
    const didCopy = onStartSessionWithIdea(steps, title);
    if (!didCopy) {
      return;
    }
    setFeedbackMessage(
      "Copied this idea into the session draft. Review the goal in the Session tab before starting."
    );
  }

  // Filter ideas by tab
  const activeIdeas = ideas.filter((i) => i.status === "active" || i.status === "accepted");
  const filteredIdeas = (() => {
    if (activeTab === "top3") {
      return activeIdeas.slice(0, 3);
    }
    if (activeTab === "week") {
      return activeIdeas.filter((i) => isThisWeek(i.createdAt));
    }
    return activeIdeas;
  })();

  return (
    <div className="stack">
      {/* Header */}
      <div className="hero">
        <div>
          <div className="eyebrow">Project Coach</div>
          <h2>Improve</h2>
          <p className="hero-subtitle">
            Evidence-based improvements for your codebase
          </p>
        </div>
        <div className="hero-meta">
          <span className="badge">{activeIdeas.length} ideas</span>
        </div>
      </div>

      {/* Workspace selector + scan controls */}
      <div className="split split-narrow">
        <section className="panel">
          <div className="panel-header">
            <h3>Workspace</h3>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="improve-workspace">
              Improvement target
            </label>
            <select
              id="improve-workspace"
              className="form-select"
              value={selectedWorkspaceId}
              onChange={(e) => onSelectWorkspace(e.target.value)}
            >
              <option value="">Select a workspace...</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <p className="form-hint">
              Improve analyzes saved workspace signals and proposes the highest-leverage next upgrades.
            </p>
          </div>
          <button
            className="btn btn-primary btn-full"
            disabled={!selectedWorkspaceId || isScanning}
            onClick={handleRunScan}
            type="button"
          >
            {isScanning ? "Scanning..." : "Scan & Generate Ideas"}
          </button>
        </section>

        <section className="panel panel-aside side-panel">
          <div className="panel-header">
            <h3>Filters</h3>
          </div>
          <div className="improve-tabs">
            <button
              type="button"
              className={`btn btn-sm ${activeTab === "top3" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveTab("top3")}
            >
              Top 3
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === "week" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveTab("week")}
            >
              This Week
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === "backlog" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveTab("backlog")}
            >
              Backlog
            </button>
          </div>
        </section>
      </div>

      {/* Error display */}
      {error && (
        <InlineMessage tone="error" title="Improve unavailable">
          <p>{error}</p>
        </InlineMessage>
      )}

      {feedbackMessage && (
        <InlineMessage tone="success" title="Improve updated">
          <p>{feedbackMessage}</p>
        </InlineMessage>
      )}

      {/* Loading state */}
      {(isLoading || isScanning) && (
        <div className="panel">
          <div className="progress-bar">
            <div className="progress-fill" />
          </div>
          <p className="text-muted text-center">
            {isScanning ? "Scanning workspace and generating ideas..." : "Loading ideas..."}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isScanning && selectedWorkspaceId && filteredIdeas.length === 0 && (
        <div className="panel">
          <div className="empty-state">
            <p className="text-muted">
              {ideas.length === 0
                ? 'No improvement ideas yet. Click "Scan & Generate Ideas" to start.'
                : "No ideas match this filter."}
            </p>
          </div>
        </div>
      )}

      {/* No workspace selected */}
      {!selectedWorkspaceId && !isLoading && (
        <div className="panel">
          <div className="empty-state">
            <p className="text-muted">Select a workspace to see improvement ideas.</p>
          </div>
        </div>
      )}

      {/* Ideas list */}
      {filteredIdeas.length > 0 && (
        <ul className="task-list">
          {filteredIdeas.map((idea) => (
            <li
              key={idea.id}
              className={`idea-card ${idea.status === "accepted" ? "idea-card-accepted" : ""} ${idea.status === "rejected" ? "idea-card-rejected" : ""}`}
            >
              {/* Card header */}
              <button
                type="button"
                className="idea-card-header"
                onClick={() => toggleExpand(idea.id)}
                aria-expanded={expandedIdeaId === idea.id}
              >
                <div className="idea-card-title-row">
                  <span className="idea-score">{Math.round(idea.score)}</span>
                  <div className="idea-card-info">
                    <span className="task-title">{idea.title}</span>
                    <div className="idea-badges">
                      <span className={`badge ${impactColor(idea.impact)}`}>
                        {idea.impact} impact
                      </span>
                      <span className="badge badge-muted">{idea.effort} effort</span>
                      <span className="badge badge-muted">{categoryLabel(idea.category)}</span>
                      <span className="badge badge-muted">
                        {Math.round(idea.confidence * 100)}% confident
                      </span>
                    </div>
                  </div>
                </div>
                <span className="idea-expand-indicator">
                  {expandedIdeaId === idea.id ? "\u25B2" : "\u25BC"}
                </span>
              </button>

              {/* Expanded content */}
              {expandedIdeaId === idea.id && (
                <div className="idea-card-body">
                  {/* Evidence */}
                  <div className="idea-section">
                    <h4 className="idea-section-label">Evidence</h4>
                    <ul className="idea-evidence-list">
                      {idea.evidence.map((ev, idx) => (
                        <li key={idx} className="idea-evidence-item">
                          <span className="idea-evidence-key">{ev.signalKey}</span>
                          <span className="idea-evidence-detail">{ev.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Acceptance Criteria */}
                  <div className="idea-section">
                    <h4 className="idea-section-label">Acceptance Criteria</h4>
                    <ul className="idea-criteria-list">
                      {idea.acceptanceCriteria.map((ac, idx) => (
                        <li key={idx}>{ac}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Steps */}
                  <div className="idea-section">
                    <h4 className="idea-section-label">Steps</h4>
                    <ol className="idea-steps-list">
                      {idea.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Actions */}
                  <div className="idea-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleUseIdeaAsDraft(idea.steps, idea.title)}
                    >
                      Use as session draft
                    </button>
                    {idea.status === "active" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-complete btn-sm"
                          onClick={() => handleFeedback(idea.id, "up")}
                        >
                          Helpful
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleFeedback(idea.id, "down")}
                        >
                          Not useful
                        </button>
                      </>
                    )}
                    {idea.status !== "active" && (
                      <span className={`badge ${idea.status === "accepted" ? "badge-active" : "badge-muted"}`}>
                        {idea.status}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
