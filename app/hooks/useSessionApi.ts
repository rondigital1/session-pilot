"use client";

import { useCallback } from "react";
import type {
  CreateTaskRequest,
  GenerateChecklistRequest,
  TaskStatus,
  UITask,
  UITaskChecklistItem,
  UITaskContext,
  UpdateTaskRequest,
} from "@/server/types/domain";
import { API } from "@/app/utils/api-routes";

interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  estimatedMinutes?: number | null;
  status: TaskStatus;
  notes?: string | null;
  checklist?: UITaskChecklistItem[];
  context?: UITaskContext;
}

function mapApiTask(apiTask: ApiTask, existing?: UITask): UITask {
  return {
    id: apiTask.id,
    title: apiTask.title,
    description: apiTask.description ?? undefined,
    estimatedMinutes: apiTask.estimatedMinutes ?? undefined,
    status: apiTask.status,
    notes: apiTask.notes ?? existing?.notes,
    checklist: apiTask.checklist ?? existing?.checklist,
    context: apiTask.context ?? existing?.context,
  };
}

interface UseSessionApiOptions {
  sessionId: string | null;
  tasks: UITask[];
  setTasksFromApi: (tasks: UITask[]) => void;
  addCreatedTask: (task: UITask) => void;
  updateTaskInState: (taskId: string, task: UITask) => void;
}

export function useSessionApi({
  sessionId,
  tasks,
  setTasksFromApi,
  addCreatedTask,
  updateTaskInState,
}: UseSessionApiOptions) {
  const syncTasksFromApi = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(API.sessionTask(sessionId));
      if (!response.ok) return;
      const data = (await response.json()) as { tasks?: ApiTask[] };
      if (!data.tasks) return;
      const mapped = data.tasks.map((apiTask) => {
        const existing = tasks.find((t) => t.id === apiTask.id);
        return mapApiTask(apiTask, existing);
      });
      setTasksFromApi(mapped);
    } catch (error) {
      console.error("Failed to sync tasks:", error);
    }
  }, [sessionId, tasks, setTasksFromApi]);

  const createTaskFromApi = useCallback(
    async (payload: CreateTaskRequest): Promise<UITask | null> => {
      if (!sessionId) return null;

      try {
        const response = await fetch(API.sessionTask(sessionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) return null;

        const data = (await response.json()) as { task?: ApiTask };
        if (!data.task) return null;

        const mapped = mapApiTask(data.task);
        addCreatedTask(mapped);
        return mapped;
      } catch (error) {
        console.error("Failed to create task:", error);
        return null;
      }
    },
    [sessionId, addCreatedTask]
  );

  const generateChecklistFromApi = useCallback(
    async (payload: GenerateChecklistRequest): Promise<string[]> => {
      if (!sessionId) return [];

      try {
        const response = await fetch(API.sessionTaskChecklist(sessionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) return [];

        const data = (await response.json()) as { items?: string[] };
        if (!Array.isArray(data.items)) return [];

        return data.items
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } catch (error) {
        console.error("Failed to generate checklist:", error);
        return [];
      }
    },
    [sessionId]
  );

  const patchTask = useCallback(
    async (taskId: string, updates: UpdateTaskRequest): Promise<UITask | null> => {
      if (!sessionId) return null;

      const currentTask = tasks.find((task) => task.id === taskId);
      const status = updates.status ?? currentTask?.status ?? "pending";

      try {
        const response = await fetch(API.sessionTask(sessionId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId,
            status,
            title: updates.title,
            description: updates.description,
            estimatedMinutes: updates.estimatedMinutes,
            notes: updates.notes,
            checklist: updates.checklist,
            context: updates.context,
          }),
        });

        if (!response.ok) return null;

        const data = (await response.json()) as { task?: ApiTask };
        if (!data.task) return null;

        const mapped = mapApiTask(data.task, currentTask);
        updateTaskInState(taskId, mapped);
        return mapped;
      } catch (error) {
        console.error("Failed to update task:", error);
        return null;
      }
    },
    [sessionId, tasks, updateTaskInState]
  );

  return {
    syncTasksFromApi,
    createTaskFromApi,
    generateChecklistFromApi,
    patchTask,
  };
}
