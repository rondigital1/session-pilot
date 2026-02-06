import { useState, useMemo } from "react";
import type {
  CreateTaskRequest,
  GenerateChecklistRequest,
  UITask,
} from "@/server/types/domain";
import AddTaskForm from "./AddTaskForm";

interface TaskSelectionViewProps {
  tasks: UITask[];
  timeBudget: number;
  userGoal: string;
  onConfirmSelection: (selectedTaskIds: string[]) => void;
  onRegenerate: () => void;
  onAddTask: (task: CreateTaskRequest) => Promise<UITask | null>;
  onGenerateChecklist: (payload: GenerateChecklistRequest) => Promise<string[]>;
  isLoading: boolean;
}

export default function TaskSelectionView({
  tasks,
  timeBudget,
  userGoal,
  onConfirmSelection,
  onRegenerate,
  onAddTask,
  onGenerateChecklist,
  isLoading,
}: TaskSelectionViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(tasks.map((t) => t.id))
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);

  const selectedTasks = useMemo(
    () => tasks.filter((t) => selectedIds.has(t.id)),
    [tasks, selectedIds]
  );

  const totalSelectedMinutes = useMemo(
    () => selectedTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0),
    [selectedTasks]
  );

  const isOverBudget = totalSelectedMinutes > timeBudget;

  function handleToggle(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(tasks.map((t) => t.id)));
  }

  function handleSelectNone() {
    setSelectedIds(new Set());
  }

  function handleConfirm() {
    onConfirmSelection(Array.from(selectedIds));
  }

  async function handleAddTask(payload: CreateTaskRequest) {
    setIsAddingTask(true);
    try {
      const newTask = await onAddTask(payload);
      if (newTask) {
        setSelectedIds((prev) => new Set([...prev, newTask.id]));
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
          <p className="eyebrow">Select tasks</p>
          <h2>{userGoal || "Choose your focus"}</h2>
          <p className="hero-subtitle">
            {tasks.length} tasks generated. Select the ones you want to work on.
          </p>
        </div>
        <div className="hero-meta">
          <span className="badge badge-muted">{timeBudget} min budget</span>
        </div>
      </section>

      <div className="grid">
        <section className="panel">
          <div className="panel-header row">
            <div>
              <h3>Generated Tasks</h3>
              <p>Check the tasks you want to include in this session.</p>
            </div>
            <div className="selection-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleSelectAll}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleSelectNone}
              >
                Clear
              </button>
            </div>
          </div>

          <ul className="task-selection-list">
            {tasks.map((task) => {
              const isSelected = selectedIds.has(task.id);
              return (
                <li
                  key={task.id}
                  className={`task-selection-item ${isSelected ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(task.id)}
                  />
                  <div className="task-content">
                    <span className="task-title">{task.title}</span>
                    {task.description && (
                      <div className="task-description">{task.description}</div>
                    )}
                  </div>
                  <div className="task-meta">
                    {task.estimatedMinutes && (
                      <span className="task-time">
                        {task.estimatedMinutes} min
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {tasks.length === 0 && !showAddForm && (
            <p className="text-muted text-center">No tasks generated</p>
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
              + Add custom task
            </button>
          )}
        </section>

        <aside className="panel panel-aside">
          <div className="panel-header">
            <h3>Selection summary</h3>
            <p>Review before starting your session.</p>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Selected</span>
              <span className="stat-value">{selectedTasks.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Available</span>
              <span className="stat-value">{tasks.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Est. time</span>
              <span className={`stat-value ${isOverBudget ? "over-budget" : ""}`}>
                {totalSelectedMinutes} min
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Budget</span>
              <span className="stat-value">{timeBudget} min</span>
            </div>
          </div>

          {isOverBudget && (
            <p className="budget-warning">
              Selected tasks exceed your time budget by{" "}
              {totalSelectedMinutes - timeBudget} minutes.
            </p>
          )}

          <div className="selection-buttons">
            <button
              className="btn btn-primary btn-full"
              onClick={handleConfirm}
              disabled={isLoading || selectedTasks.length === 0}
            >
              {isLoading ? "Starting..." : `Start session (${selectedTasks.length} tasks)`}
            </button>
            <button
              className="btn btn-outline btn-full"
              onClick={onRegenerate}
              disabled={isLoading}
            >
              Regenerate tasks
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
