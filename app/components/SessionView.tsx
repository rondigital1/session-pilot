import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type {
  CreateTaskRequest,
  GenerateChecklistRequest,
  UITask,
} from "@/server/types/domain";
import SessionTimer from "./SessionTimer";
import AddTaskForm from "./AddTaskForm";

interface SessionViewProps {
  tasks: UITask[];
  timeBudget: number;
  userGoal: string;
  sessionStartedAt: string | null;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: CreateTaskRequest) => Promise<UITask | null>;
  onGenerateChecklist: (payload: GenerateChecklistRequest) => Promise<string[]>;
  onEndSession: () => void;
  isLoading: boolean;
}

function getChecklistStats(task: UITask) {
  if (!task.checklist || task.checklist.length === 0) {
    return null;
  }
  const total = task.checklist.length;
  const done = task.checklist.filter((item) => item.done).length;
  return { total, done };
}

export default function SessionView({
  tasks,
  timeBudget,
  userGoal,
  sessionStartedAt,
  onToggleTask,
  onAddTask,
  onGenerateChecklist,
  onEndSession,
  isLoading,
}: SessionViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;
  const ringStyle = { "--progress": `${progress}%` } as CSSProperties;

  async function handleAddTask(payload: CreateTaskRequest) {
    setIsAddingTask(true);
    try {
      const newTask = await onAddTask(payload);
      if (newTask) {
        setShowAddForm(false);
      }
    } finally {
      setIsAddingTask(false);
    }
  }

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Session active</p>
          <h2>{userGoal || "Session in motion"}</h2>
          <p className="hero-subtitle">
            {completedCount} of {tasks.length} tasks completed · {timeBudget} min
            budget
          </p>
        </div>
        <div className="hero-meta">
          <span className="badge badge-active">In progress</span>
          <div className="progress-ring" style={ringStyle}>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </section>

      <div className="grid">
        <section className="panel">
          <div className="panel-header row">
            <div>
              <h3>Tasks</h3>
              <p>Keep the session tight, one task at a time.</p>
            </div>
            <span className="badge badge-muted">{tasks.length} total</span>
          </div>

          <ul className="task-list">
            {tasks.map((task) => {
              const checklistStats = getChecklistStats(task);
              return (
                <li
                  key={task.id}
                  className={`task-item ${task.status === "completed" ? "task-item-completed" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={task.status === "completed"}
                    onChange={() => onToggleTask(task.id)}
                  />
                  <div className="task-content">
                    <Link
                      href={`/tasks/${task.id}`}
                      className={`task-title ${
                        task.status === "completed" ? "completed" : ""
                      }`}
                    >
                      {task.title}
                    </Link>
                    {task.description && (
                      <div className="task-description">{task.description}</div>
                    )}
                    {checklistStats && (
                      <div className="task-subtasks">
                        {checklistStats.done}/{checklistStats.total} checklist
                        items
                      </div>
                    )}
                  </div>
                  <div className="task-meta">
                    {task.estimatedMinutes && (
                      <span className="task-time">
                        {task.estimatedMinutes} min
                      </span>
                    )}
                    <span className="task-link">
                      {task.status === "completed" ? "Completed" : "Open"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {tasks.length === 0 && !showAddForm && (
            <p className="text-muted text-center">No tasks yet</p>
          )}

          {showAddForm ? (
            <div className="add-task-section">
              <div className="add-task-header">
                <h4>Add custom task</h4>
              </div>
              <AddTaskForm
                onSubmit={handleAddTask}
                onGenerateChecklist={onGenerateChecklist}
                onCancel={() => setShowAddForm(false)}
                isLoading={isAddingTask}
              />
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-outline btn-full add-task-btn"
              onClick={() => setShowAddForm(true)}
              disabled={isLoading}
            >
              + Add task
            </button>
          )}
        </section>

        <aside className="panel panel-aside">
          <div className="panel-header">
            <h3>Session timer</h3>
            <p>Track your time and stay focused.</p>
          </div>

          <SessionTimer
            timeBudgetMinutes={timeBudget}
            sessionStartedAt={sessionStartedAt}
          />

          <div className="panel-header" style={{ marginTop: "1rem" }}>
            <h3>Session stats</h3>
            <p>Quick pulse check before you wrap.</p>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Completed</span>
              <span className="stat-value">{completedCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Remaining</span>
              <span className="stat-value">{tasks.length - completedCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Budget</span>
              <span className="stat-value">{timeBudget} min</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Progress</span>
              <span className="stat-value">{Math.round(progress)}%</span>
            </div>
          </div>

          <button
            className="btn btn-success btn-full"
            onClick={onEndSession}
            disabled={isLoading}
          >
            {isLoading ? "Ending..." : "End session"}
          </button>
        </aside>
      </div>
    </div>
  );
}
