"use client";

import { useState } from "react";
import type { CreateTaskRequest, UITaskChecklistItem } from "@/server/types/domain";

interface AddTaskFormProps {
  onSubmit: (task: CreateTaskRequest) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export default function AddTaskForm({
  onSubmit,
  onCancel,
  isLoading = false,
}: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>("");
  const [checklistInput, setChecklistInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function parseChecklist(input: string): UITaskChecklistItem[] {
    if (!input.trim()) return [];

    return input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => ({
        id: `item-${index}-${Date.now()}`,
        title: line.replace(/^[-*•]\s*/, ""),
        done: false,
      }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Task title is required");
      return;
    }

    const payload: CreateTaskRequest = {
      title: title.trim(),
    };

    if (description.trim()) {
      payload.description = description.trim();
    }

    const minutes = parseInt(estimatedMinutes, 10);
    if (!isNaN(minutes) && minutes > 0) {
      payload.estimatedMinutes = minutes;
    }

    const checklist = parseChecklist(checklistInput);
    if (checklist.length > 0) {
      payload.checklist = checklist;
    }

    try {
      await onSubmit(payload);
      setTitle("");
      setDescription("");
      setEstimatedMinutes("");
      setChecklistInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="add-task-form">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="form-group">
        <label htmlFor="task-title" className="form-label">
          Task title *
        </label>
        <input
          id="task-title"
          type="text"
          className={`form-input ${error && !title.trim() ? "form-input-error" : ""}`}
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isLoading}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label htmlFor="task-description" className="form-label">
          Description
        </label>
        <textarea
          id="task-description"
          className="form-textarea"
          placeholder="Add more details about this task..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="task-estimate" className="form-label">
          Time estimate (minutes)
        </label>
        <input
          id="task-estimate"
          type="number"
          className="form-input"
          placeholder="15"
          min="1"
          max="480"
          value={estimatedMinutes}
          onChange={(e) => setEstimatedMinutes(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="task-checklist" className="form-label">
          Checklist items
        </label>
        <textarea
          id="task-checklist"
          className="form-textarea"
          placeholder="One item per line:&#10;- Review the PR&#10;- Run tests&#10;- Update docs"
          value={checklistInput}
          onChange={(e) => setChecklistInput(e.target.value)}
          disabled={isLoading}
          rows={4}
        />
        <p className="form-hint">Enter one checklist item per line</p>
      </div>

      <div className="form-actions">
        {onCancel && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading || !title.trim()}
        >
          {isLoading ? "Adding..." : "Add task"}
        </button>
      </div>
    </form>
  );
}
