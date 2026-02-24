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
  UITask,
  UpdateTaskRequest,
} from "@/server/types/domain";
import { useSessionApi } from "@/app/hooks/useSessionApi";

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

  const setTasksFromApi = useCallback((mappedTasks: UITask[]) => {
    setSessionData((prev) => {
      const existingIds = new Set(mappedTasks.map((t) => t.id));
      const leftover = prev.tasks.filter((t) => !existingIds.has(t.id));
      return {
        ...prev,
        tasks: dedupeTasksById([...mappedTasks, ...leftover]),
      };
    });
  }, []);

  const addCreatedTask = useCallback((task: UITask) => {
    setSessionData((prev) => ({
      ...prev,
      tasks: dedupeTasksById([...prev.tasks, task]),
    }));
  }, []);

  const updateTaskInState = useCallback((taskId: string, task: UITask) => {
    setSessionData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? task : t)),
    }));
  }, []);

  const { syncTasksFromApi, createTaskFromApi, generateChecklistFromApi, patchTask } =
    useSessionApi({
      sessionId: sessionData.sessionId,
      tasks: sessionData.tasks,
      setTasksFromApi,
      addCreatedTask,
      updateTaskInState,
    });

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
