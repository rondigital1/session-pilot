"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { useSession } from "@/app/session-context";
import { useEffect } from "react";

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

  const checklist = task.checklist || [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const handleChecklistToggle = (itemId: string) => {
    const updatedChecklist = checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    toggleChecklistItem(task.id, itemId);
    void patchTask(task.id, { status: task.status, checklist: updatedChecklist });
  };

  return (
    <AppShell active="task" showTaskNav={showTaskNav}>
      <div className="task-page">
        <header className="task-hero">
          <div>
            <p className="eyebrow">Task focus</p>
            <h1>{task.title}</h1>
            {task.description && <p className="hero-subtitle">{task.description}</p>}
          </div>
          <div className="task-hero-meta">
            <button
              className={`btn btn-outline ${
                task.status === "completed" ? "btn-complete" : ""
              }`}
              onClick={() =>
                patchTask(task.id, {
                  status: task.status === "completed" ? "pending" : "completed",
                })
              }
            >
              {task.status === "completed" ? "Mark incomplete" : "Mark complete"}
            </button>
            {task.estimatedMinutes && (
              <span className="badge badge-active">{task.estimatedMinutes} min</span>
            )}
            <span className="badge badge-muted">
              {checklistDone}/{checklist.length} checklist items
            </span>
          </div>
        </header>

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
              {task.context?.files?.length ? (
                <ul>
                  {task.context.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No files linked.</p>
              )}
            </div>
            <div className="context-block">
              <h4>Related issues</h4>
              {task.context?.relatedIssues?.length ? (
                <ul>
                  {task.context.relatedIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No linked issues.</p>
              )}
            </div>
            <div className="context-block">
              <h4>Links</h4>
              {task.context?.links?.length ? (
                <ul>
                  {task.context.links.map((link) => (
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
            value={task.notes || ""}
            onChange={(event) => updateTaskNotes(task.id, event.target.value)}
            onBlur={(event) =>
              patchTask(task.id, {
                status: task.status,
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
