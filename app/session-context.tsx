"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CreateTaskRequest,
  FocusWeights,
  GenerateChecklistRequest,
  SessionMetrics,
  SessionState,
  TaskStatus,
  UITaskChecklistItem,
  UITaskContext,
  UpdateTaskRequest,
  UITask,
} from "@/server/types/domain";

const STORAGE_KEY = "session-pilot:session";

const defaultFocusWeights: FocusWeights = {
  bugs: 0.5,
  features: 0.5,
  refactor: 0.3,
};

const initialSessionData = {
  sessionState: "start" as SessionState,
  sessionId: null as string | null,
  userGoal: "",
  timeBudget: 60,
  focusWeights: defaultFocusWeights,
  tasks: [] as UITask[],
  summary: "",
  sessionMetrics: null as SessionMetrics | null,
  sessionStartedAt: null as string | null,
};

type SessionData = typeof initialSessionData;

interface SessionContextValue extends SessionData {
  setSessionState: (state: SessionState) => void;
  setSessionId: (id: string | null) => void;
  setUserGoal: (goal: string) => void;
  setTimeBudget: (minutes: number) => void;
  setFocusWeights: (weights: FocusWeights) => void;
  setSummary: (summary: string) => void;
  setSessionMetrics: (metrics: SessionMetrics | null) => void;
  setTasks: Dispatch<SetStateAction<UITask[]>>;
  setSessionStartedAt: (timestamp: string | null) => void;
  syncTasksFromApi: () => Promise<void>;
  createTaskFromApi: (payload: CreateTaskRequest) => Promise<UITask | null>;
  generateChecklistFromApi: (payload: GenerateChecklistRequest) => Promise<string[]>;
  patchTask: (taskId: string, updates: UpdateTaskRequest) => Promise<UITask | null>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  toggleTaskStatus: (taskId: string) => void;
  toggleChecklistItem: (taskId: string, itemId: string) => void;
  updateTaskNotes: (taskId: string, notes: string) => void;
  resetSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

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

function dedupeTasksById(tasks: UITask[]): UITask[] {
  const seen = new Set<string>();
  const deduped: UITask[] = [];

  for (const task of tasks) {
    if (seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    deduped.push(task);
  }

  return deduped;
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

function mergeApiTasks(prevTasks: UITask[], apiTasks: ApiTask[]) {
  const byId = new Map(prevTasks.map((task) => [task.id, task]));
  const merged = apiTasks.map((task) => mapApiTask(task, byId.get(task.id)));
  const existingIds = new Set(apiTasks.map((task) => task.id));
  const leftover = prevTasks.filter((task) => !existingIds.has(task.id));
  return [...merged, ...leftover];
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionData, setSessionData] = useState<SessionData>(
    initialSessionData
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<SessionData>;
        setSessionData({
          ...initialSessionData,
          ...parsed,
          tasks: dedupeTasksById(parsed.tasks ?? []),
        });
      } catch {
        setSessionData(initialSessionData);
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  }, [isHydrated, sessionData]);

  const setSessionState = useCallback((sessionState: SessionState) => {
    setSessionData((prev) => ({ ...prev, sessionState }));
  }, []);

  const setSessionId = useCallback((sessionId: string | null) => {
    setSessionData((prev) => ({ ...prev, sessionId }));
  }, []);

  const setUserGoal = useCallback((userGoal: string) => {
    setSessionData((prev) => ({ ...prev, userGoal }));
  }, []);

  const setTimeBudget = useCallback((timeBudget: number) => {
    setSessionData((prev) => ({ ...prev, timeBudget }));
  }, []);

  const setFocusWeights = useCallback((focusWeights: FocusWeights) => {
    setSessionData((prev) => ({ ...prev, focusWeights }));
  }, []);

  const setSummary = useCallback((summary: string) => {
    setSessionData((prev) => ({ ...prev, summary }));
  }, []);

  const setSessionMetrics = useCallback((sessionMetrics: SessionMetrics | null) => {
    setSessionData((prev) => ({ ...prev, sessionMetrics }));
  }, []);

  const setTasks = useCallback((tasks: SetStateAction<UITask[]>) => {
    setSessionData((prev) => ({
      ...prev,
      tasks: dedupeTasksById(
        typeof tasks === "function" ? tasks(prev.tasks) : tasks
      ),
    }));
  }, []);

  const setSessionStartedAt = useCallback((sessionStartedAt: string | null) => {
    setSessionData((prev) => ({ ...prev, sessionStartedAt }));
  }, []);

  const updateTaskStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      setSessionData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === taskId ? { ...task, status } : task
        ),
      }));
    },
    []
  );

  const toggleTaskStatus = useCallback(
    (taskId: string) => {
      setSessionData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          const status = task.status === "completed" ? "pending" : "completed";
          return { ...task, status };
        }),
      }));
    },
    []
  );

  const toggleChecklistItem = useCallback((taskId: string, itemId: string) => {
    setSessionData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => {
        if (task.id !== taskId || !task.checklist) {
          return task;
        }
        return {
          ...task,
          checklist: task.checklist.map((item) =>
            item.id === itemId ? { ...item, done: !item.done } : item
          ),
        };
      }),
    }));
  }, []);

  const updateTaskNotes = useCallback((taskId: string, notes: string) => {
    setSessionData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === taskId ? { ...task, notes } : task
      ),
    }));
  }, []);

  const syncTasksFromApi = useCallback(async () => {
    if (!sessionData.sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/session/${sessionData.sessionId}/task`);
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { tasks?: ApiTask[] };
      if (!data.tasks) {
        return;
      }
      setSessionData((prev) => ({
        ...prev,
        tasks: dedupeTasksById(mergeApiTasks(prev.tasks, data.tasks || [])),
      }));
    } catch (error) {
      console.error("Failed to sync tasks:", error);
    }
  }, [sessionData.sessionId]);

  const createTaskFromApi = useCallback(
    async (payload: CreateTaskRequest) => {
      if (!sessionData.sessionId) {
        return null;
      }

      try {
        const response = await fetch(
          `/api/session/${sessionData.sessionId}/task`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as { task?: ApiTask };
        if (!data.task) {
          return null;
        }

        const mapped = mapApiTask(data.task);
        setSessionData((prev) => ({
          ...prev,
          tasks: dedupeTasksById([...prev.tasks, mapped]),
        }));
        return mapped;
      } catch (error) {
        console.error("Failed to create task:", error);
        return null;
      }
    },
    [sessionData.sessionId]
  );

  const generateChecklistFromApi = useCallback(
    async (payload: GenerateChecklistRequest) => {
      if (!sessionData.sessionId) {
        return [];
      }

      try {
        const response = await fetch(
          `/api/session/${sessionData.sessionId}/task/checklist`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          return [];
        }

        const data = (await response.json()) as { items?: string[] };
        if (!Array.isArray(data.items)) {
          return [];
        }

        return data.items
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } catch (error) {
        console.error("Failed to generate checklist:", error);
        return [];
      }
    },
    [sessionData.sessionId]
  );

  const patchTask = useCallback(
    async (taskId: string, updates: UpdateTaskRequest) => {
      if (!sessionData.sessionId) {
        return null;
      }

      const currentTask = sessionData.tasks.find((task) => task.id === taskId);
      const status = updates.status ?? currentTask?.status ?? "pending";

      try {
        const response = await fetch(
          `/api/session/${sessionData.sessionId}/task`,
          {
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
          }
        );

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as { task?: ApiTask };
        if (!data.task) {
          return null;
        }

        const mapped = mapApiTask(data.task, currentTask);
        setSessionData((prev) => ({
          ...prev,
          tasks: prev.tasks.map((task) =>
            task.id === taskId ? mapped : task
          ),
        }));
        return mapped;
      } catch (error) {
        console.error("Failed to update task:", error);
        return null;
      }
    },
    [sessionData.sessionId, sessionData.tasks, updateTaskNotes, updateTaskStatus]
  );

  const resetSession = useCallback(() => {
    setSessionData(initialSessionData);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...sessionData,
      setSessionState,
      setSessionId,
      setUserGoal,
      setTimeBudget,
      setFocusWeights,
      setSummary,
      setSessionMetrics,
      setTasks,
      setSessionStartedAt,
      syncTasksFromApi,
      createTaskFromApi,
      generateChecklistFromApi,
      patchTask,
      updateTaskStatus,
      toggleTaskStatus,
      toggleChecklistItem,
      updateTaskNotes,
      resetSession,
    }),
    [
      sessionData,
      setSessionState,
      setSessionId,
      setUserGoal,
      setTimeBudget,
      setFocusWeights,
      setSummary,
      setSessionMetrics,
      setTasks,
      setSessionStartedAt,
      syncTasksFromApi,
      createTaskFromApi,
      generateChecklistFromApi,
      patchTask,
      updateTaskStatus,
      toggleTaskStatus,
      toggleChecklistItem,
      updateTaskNotes,
      resetSession,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
