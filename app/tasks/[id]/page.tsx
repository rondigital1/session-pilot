"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import InlineMessage from "@/app/components/InlineMessage";
import { API } from "@/app/utils/api-routes";
import { useSession } from "@/app/session-context";
import type { SessionState, UISession } from "@/server/types/domain";
import { useEffect, useRef, useState } from "react";

function getParamId(param: string | string[] | undefined) {
  if (!param) {
    return "";
  }
  return Array.isArray(param) ? param[0] : param;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const taskId = getParamId(params?.id);
  const {
    tasks,
    toggleChecklistItem,
    updateTaskNotes,
    sessionId,
    setSessionId,
    setSessionState,
    setUserGoal,
    setTimeBudget,
    setFocusWeights,
    setSummary,
    setSessionMetrics,
    setTasks,
    setSessionStartedAt,
    syncTasksFromApi,
    patchTask,
    sessionState,
  } = useSession();
  const linkedSessionId = searchParams.get("session")?.trim() || null;
  const attemptedLinkedSessionRef = useRef<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const task = tasks.find((item) => item.id === taskId);

  function getRecoveredState(session: UISession): SessionState {
    if (session.status === "completed") {
      return "summary";
    }

    if (session.status === "planning") {
      return "planning";
    }

    return "session";
  }

  useEffect(() => {
    if (
      task ||
      !linkedSessionId ||
      linkedSessionId === sessionId ||
      attemptedLinkedSessionRef.current === linkedSessionId
    ) {
      return;
    }

    const recoverySessionId = linkedSessionId;
    attemptedLinkedSessionRef.current = recoverySessionId;
    let cancelled = false;

    async function recoverLinkedSession() {
      setRecoveryState("loading");
      setRecoveryError(null);

      try {
        const response = await fetch(API.session(recoverySessionId), {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok || !data.session) {
          throw new Error(data.error || "Unable to recover the linked session.");
        }

        const recoveredSession = data.session as UISession;

        if (cancelled) {
          return;
        }

        setSessionId(recoveredSession.id);
        setSessionState(getRecoveredState(recoveredSession));
        setUserGoal(recoveredSession.userGoal);
        setTimeBudget(recoveredSession.timeBudgetMinutes);
        setFocusWeights(recoveredSession.focusWeights);
        setTasks(recoveredSession.tasks);
        setSummary(recoveredSession.summary ?? "");
        setSessionMetrics(recoveredSession.metrics ?? null);
        setSessionStartedAt(recoveredSession.startedAt ?? null);
        setRecoveryState("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRecoveryState("error");
        setRecoveryError(
          error instanceof Error
            ? error.message
            : "Unable to recover the linked session."
        );
      }
    }

    void recoverLinkedSession();

    return () => {
      cancelled = true;
    };
  }, [
    linkedSessionId,
    sessionId,
    setFocusWeights,
    setSessionId,
    setSessionMetrics,
    setSessionStartedAt,
    setSessionState,
    setSummary,
    setTasks,
    setTimeBudget,
    setUserGoal,
    task,
  ]);

  useEffect(() => {
    if (
      task ||
      !sessionId ||
      recoveryState === "loading" ||
      (linkedSessionId && linkedSessionId !== sessionId)
    ) {
      return;
    }
    void syncTasksFromApi();
  }, [linkedSessionId, recoveryState, sessionId, syncTasksFromApi, task]);

  const showTaskNav = sessionState === "session" && tasks.length > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [notesSaveState, setNotesSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (notesSaveState !== "saved") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotesSaveState("idle");
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [notesSaveState]);

  useEffect(() => {
    if (!task || isEditing) {
      return;
    }
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditEstimatedMinutes(task.estimatedMinutes ? String(task.estimatedMinutes) : "");
  }, [isEditing, task]);

  if (!task && recoveryState === "loading") {
    return (
      <AppShell active="task" showTaskNav={showTaskNav}>
        <section className="panel empty-state">
          <h2>Recovering task context</h2>
          <p>Reloading the linked session so this task page can open with the right context.</p>
        </section>
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell active="task" showTaskNav={showTaskNav}>
        <section className="panel empty-state">
          <h2>Task not found</h2>
          <p>
            {recoveryError
              ? recoveryError
              : linkedSessionId
                ? "We restored the linked session, but this task is no longer part of it. Return to SessionPilot and reopen the task from the current task list."
                : sessionId
                  ? "We couldn't find this task in the current session. Return to the session view and reopen it from the task list."
                  : "Task detail pages work best when opened from an active session. Return to SessionPilot and reopen the task from the current task list."}
          </p>
          {!linkedSessionId && (
            <InlineMessage tone="info" title="Tip for direct links">
              <p>Open task links from an active session so SessionPilot can restore the right session context after a refresh.</p>
            </InlineMessage>
          )}
          <Link className="btn btn-primary" href="/">
            Return to session
          </Link>
        </section>
      </AppShell>
    );
  }

  const currentTask = task;
  const checklist = currentTask.checklist || [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const handleChecklistToggle = (itemId: string) => {
    const updatedChecklist = checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    toggleChecklistItem(currentTask.id, itemId);
    void patchTask(currentTask.id, {
      status: currentTask.status,
      checklist: updatedChecklist,
    });
  };

  async function handleSaveEdits() {
    const title = editTitle.trim();
    if (!title) {
      setEditError("Task title is required");
      return;
    }

    const minutesInput = editEstimatedMinutes.trim();
    let estimatedMinutes: number | null = null;

    if (minutesInput) {
      const parsed = parseInt(minutesInput, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 480) {
        setEditError("Time estimate must be between 1 and 480 minutes");
        return;
      }
      estimatedMinutes = parsed;
    }

    setEditError(null);
    setIsSavingEdits(true);
    try {
      const updated = await patchTask(currentTask.id, {
        status: currentTask.status,
        title,
        description: editDescription.trim() || null,
        estimatedMinutes,
      });

      if (!updated) {
        setEditError("Failed to save task changes");
        return;
      }

      setIsEditing(false);
    } finally {
      setIsSavingEdits(false);
    }
  }

  function handleCancelEdits() {
    setEditTitle(currentTask.title);
    setEditDescription(currentTask.description || "");
    setEditEstimatedMinutes(
      currentTask.estimatedMinutes ? String(currentTask.estimatedMinutes) : ""
    );
    setEditError(null);
    setIsEditing(false);
  }

  async function handleSaveNotes(notes: string) {
    setNotesSaveState("saving");
    const updated = await patchTask(currentTask.id, {
      status: currentTask.status,
      notes,
    });

    if (!updated) {
      setNotesSaveState("error");
      return;
    }

    setNotesSaveState("saved");
  }

  return (
    <AppShell active="task" showTaskNav={showTaskNav}>
      <div className="task-page">
        <header
          className={`task-hero ${
            currentTask.status === "completed" ? "task-hero-completed" : ""
          }`}
        >
          <div>
            <p className="eyebrow">Task focus</p>
            <h1>{currentTask.title}</h1>
            {currentTask.description && (
              <p className="hero-subtitle">{currentTask.description}</p>
            )}
          </div>
          <div className="task-hero-meta">
            <button
              className={`btn btn-outline ${
                currentTask.status === "completed" ? "btn-complete" : ""
              }`}
              onClick={() =>
                patchTask(currentTask.id, {
                  status:
                    currentTask.status === "completed" ? "pending" : "completed",
                })
              }
            >
              {currentTask.status === "completed"
                ? "Mark incomplete"
                : "Mark complete"}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => (isEditing ? handleCancelEdits() : setIsEditing(true))}
            >
              {isEditing ? "Cancel edit" : "Edit task"}
            </button>
            {currentTask.estimatedMinutes && (
              <span className="badge badge-active">
                {currentTask.estimatedMinutes} min
              </span>
            )}
            <span className="badge badge-muted">
              {checklistDone}/{checklist.length} checklist items
            </span>
          </div>
        </header>

        {isEditing && (
          <section className="panel">
            <div className="panel-header">
              <h3>Edit task</h3>
              <p>Update details after creation without losing notes or checklist progress.</p>
            </div>
            {editError && <div className="form-error-banner">{editError}</div>}
            <div className="form-group">
              <label htmlFor="task-edit-title" className="form-label">
                Title
              </label>
              <input
                id="task-edit-title"
                type="text"
                className="form-input"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                disabled={isSavingEdits}
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-edit-description" className="form-label">
                Description
              </label>
              <textarea
                id="task-edit-description"
                className="form-textarea"
                rows={4}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                disabled={isSavingEdits}
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-edit-estimate" className="form-label">
                Time estimate (minutes)
              </label>
              <input
                id="task-edit-estimate"
                type="number"
                min="1"
                max="480"
                className="form-input"
                placeholder="Optional"
                value={editEstimatedMinutes}
                onChange={(event) => setEditEstimatedMinutes(event.target.value)}
                disabled={isSavingEdits}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCancelEdits}
                disabled={isSavingEdits}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveEdits}
                disabled={isSavingEdits || !editTitle.trim()}
              >
                {isSavingEdits ? "Saving..." : "Save changes"}
              </button>
            </div>
          </section>
        )}

        <div className="task-grid">
          <section className="panel">
            <div className="panel-header">
              <h3>Checklist</h3>
              <p>Break the task into fast wins.</p>
            </div>
            {checklist.length === 0 ? (
              <p className="text-muted">No checklist items yet.</p>
            ) : (
              <ul className="checklist">
                {checklist.map((item) => (
                  <li key={item.id} className="checklist-item">
                    <label className="checklist-row">
                      <input
                        type="checkbox"
                        checked={Boolean(item.done)}
                        onChange={() => handleChecklistToggle(item.id)}
                      />
                      <span className={item.done ? "done" : ""}>{item.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="panel panel-aside">
            <div className="panel-header">
              <h3>Context</h3>
              <p>Everything you need, in one glance.</p>
            </div>
            <div className="context-block">
              <h4>Files</h4>
              {currentTask.context?.files?.length ? (
                <ul>
                  {currentTask.context.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No files linked.</p>
              )}
            </div>
            <div className="context-block">
              <h4>Related issues</h4>
              {currentTask.context?.relatedIssues?.length ? (
                <ul>
                  {currentTask.context.relatedIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No linked issues.</p>
              )}
            </div>
            <div className="context-block">
              <h4>Links</h4>
              {currentTask.context?.links?.length ? (
                <ul>
                  {currentTask.context.links.map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No links saved.</p>
              )}
            </div>
          </aside>
        </div>

        <section className="panel">
          <div className="panel-header">
            <h3>Notes</h3>
            <p>Capture key decisions and next steps.</p>
          </div>
          {notesSaveState === "error" && (
            <InlineMessage tone="error" title="Notes not saved">
              <p>We couldn't save your notes. Try again after a moment.</p>
            </InlineMessage>
          )}
          {notesSaveState === "saving" && (
            <p className="save-status" role="status" aria-live="polite">
              Saving notes...
            </p>
          )}
          {notesSaveState === "saved" && (
            <p className="save-status save-status-success" role="status" aria-live="polite">
              Notes saved
            </p>
          )}
          <textarea
            className="form-textarea"
            placeholder="Add your notes, commands, or decisions..."
            value={currentTask.notes || ""}
            onChange={(event) => {
              setNotesSaveState("idle");
              updateTaskNotes(currentTask.id, event.target.value);
            }}
            onBlur={(event) => void handleSaveNotes(event.target.value)}
          />
        </section>

        <div className="task-footer">
          <Link className="btn btn-secondary" href="/">
            Back to session
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
