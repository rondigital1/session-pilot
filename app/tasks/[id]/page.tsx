"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { useSession } from "@/app/session-context";
import { useEffect, useState } from "react";

function getParamId(param: string | string[] | undefined) {
  if (!param) {
    return "";
  }
  return Array.isArray(param) ? param[0] : param;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = getParamId(params?.id);
  const {
    tasks,
    toggleChecklistItem,
    updateTaskNotes,
    sessionId,
    syncTasksFromApi,
    patchTask,
    sessionState,
  } = useSession();

  const task = tasks.find((item) => item.id === taskId);

  useEffect(() => {
    if (task || !sessionId) {
      return;
    }
    void syncTasksFromApi();
  }, [sessionId, syncTasksFromApi, task]);

  const showTaskNav = sessionState === "session" && tasks.length > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdits, setIsSavingEdits] = useState(false);

  useEffect(() => {
    if (!task || isEditing) {
      return;
    }
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditEstimatedMinutes(task.estimatedMinutes ? String(task.estimatedMinutes) : "");
  }, [isEditing, task]);

  if (!task) {
    return (
      <AppShell active="task" showTaskNav={showTaskNav}>
        <section className="panel empty-state">
          <h2>Task not found</h2>
          <p>We couldn’t load this task. Head back to the session list.</p>
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
          <textarea
            className="form-textarea"
            placeholder="Add your notes, commands, or decisions..."
            value={currentTask.notes || ""}
            onChange={(event) =>
              updateTaskNotes(currentTask.id, event.target.value)
            }
            onBlur={(event) =>
              patchTask(currentTask.id, {
                status: currentTask.status,
                notes: event.target.value,
              })
            }
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
