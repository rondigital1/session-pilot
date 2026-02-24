"use client";

import { useEffect, useState } from "react";
import type { SSEEvent, UIWorkspace } from "@/server/types/domain";
import AppShell from "./components/AppShell";
import StartView from "./components/StartView";
import PlanningView from "./components/PlanningView";
import TaskSelectionView from "./components/TaskSelectionView";
import SessionView from "./components/SessionView";
import SummaryView from "./components/SummaryView";
import ImproveView from "./components/ImproveView";
import WorkspaceManager from "./components/WorkspaceManager";
import { useSession } from "./session-context";
import { playSessionCompleteSound, resumeAudioContext } from "@/lib/audio";
import { API } from "@/app/utils/api-routes";
import { useSessionEvents } from "@/app/hooks/useSessionEvents";

/**
 * SessionPilot - Single Page Application
 *
 * States:
 * 1. Start - Select workspace, set time budget, focus sliders, enter goal
 * 2. Planning - SSE events show scanning progress and task generation
 * 3. Task Selection - User selects which tasks to include in the session
 * 4. Session - Work through tasks, check them off
 * 5. Summary - View session summary, save for tomorrow
 */

type AppView = "session" | "improve";

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<UIWorkspace[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [showWorkspaceManager, setShowWorkspaceManager] = useState<boolean>(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [isPlanningStreamComplete, setIsPlanningStreamComplete] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("session");

  const {
    sessionState,
    setSessionState,
    sessionId,
    setSessionId,
    tasks,
    setTasks,
    userGoal,
    setUserGoal,
    timeBudget,
    setTimeBudget,
    focusWeights,
    setFocusWeights,
    summary,
    setSummary,
    sessionMetrics,
    setSessionMetrics,
    sessionStartedAt,
    setSessionStartedAt,
    syncTasksFromApi,
    createTaskFromApi,
    generateChecklistFromApi,
    patchTask,
    resetSession,
  } = useSession();

  const {
    eventSource,
    planningError,
    isPlanningStreamComplete,
    connectToEvents,
    setPlanningError,
    setIsPlanningStreamComplete,
  } = useSessionEvents({
    onEvent: handleSSEEvent,
    onError: (message) => {
      addEvent(message);
      setIsLoading(false);
      setSessionState("start");
    },
    onClosed: () => {
      setIsLoading(false);
      setSessionState("start");
    },
  });

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    if (tasks.length === 0 && sessionState !== "start") {
      void syncTasksFromApi();
    }
  }, [sessionId, sessionState, syncTasksFromApi, tasks.length]);

  // Reconnect to SSE or recover state if we're in planning state but have no connection
  // (e.g., after page reload during planning)
  useEffect(() => {
    if (
      sessionId &&
      sessionState === "planning" &&
      !eventSource &&
      !isPlanningStreamComplete
    ) {
      console.log("[SSE Client] Reconnecting to session after page load");
      setIsLoading(true);
      connectToEvents(sessionId);
    }
  }, [sessionId, sessionState, eventSource, isPlanningStreamComplete]);

  // If we have tasks while in planning state, planning already completed - advance to task selection
  useEffect(() => {
    if (sessionState === "planning" && tasks.length > 0 && !isLoading) {
      console.log("[Session] Planning complete with tasks, advancing to task selection");
      setSessionState("task_selection");
    }
  }, [sessionState, tasks.length, isLoading, setSessionState]);

  async function loadWorkspaces() {
    try {
      const response = await fetch(API.workspaces);
      const data = await response.json();
      setWorkspaces(data.workspaces || []);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
      setWorkspaces([]);
    }
  }

  async function handleStartSession() {
    if (!selectedWorkspaceId || !userGoal) {
      return;
    }

    setIsLoading(true);
    setEvents([]);
    setTasks([]);
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    setSessionState("planning");

    try {
      const response = await fetch(API.sessionStart, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          userGoal,
          timeBudgetMinutes: timeBudget,
          focusWeights,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start session");
      }

      setSessionId(data.sessionId);
      connectToEvents(data.sessionId);
    } catch (error) {
      console.error("Failed to start session:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addEvent(`Error: ${message}`);
      setPlanningError(message);
      setIsLoading(false);
      setSessionState("start");
    }
  }

  function handleSSEEvent(event: SSEEvent) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "connected":
        addEvent(`[${time}] Connected to session`);
        break;

      case "heartbeat":
        break;

      case "scan_started":
      case "scan_progress":
      case "scan_completed":
        addEvent(
          `[${time}] ${(event.data as { message?: string }).message || event.type}`
        );
        break;

      case "planning_started":
        addEvent(`[${time}] Generating session plan...`);
        break;

      case "task_generated": {
        const taskData = event.data as {
          taskId: string;
          title: string;
          description?: string;
          estimatedMinutes?: number;
        };
        setTasks((prev) => {
          const incomingTask = {
            id: taskData.taskId,
            title: taskData.title,
            description: taskData.description,
            estimatedMinutes: taskData.estimatedMinutes,
            status: "pending" as const,
          };
          const existingIndex = prev.findIndex((task) => task.id === taskData.taskId);
          if (existingIndex === -1) {
            return [...prev, incomingTask];
          }

          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...incomingTask };
          return next;
        });
        addEvent(`[${time}] Task: ${taskData.title}`);
        break;
      }

      case "planning_completed":
        addEvent(`[${time}] Planning complete!`);
        setIsLoading(false);
        void syncTasksFromApi();
        setTimeout(() => {
          setSessionState("task_selection");
        }, 1000);
        break;

      case "session_ended": {
        const endData = event.data as { cancelled?: boolean; streamComplete?: boolean };
        if (endData.streamComplete) {
          setIsLoading(false);
        }
        if (endData.cancelled) {
          addEvent(`[${time}] Session cancelled`);
        }
        break;
      }

      case "error": {
        const errorData = event.data as { code?: string; message?: string };
        const errorMessage = errorData.message || "Unknown error";
        addEvent(`[${time}] Error: ${errorMessage}`);
        setIsLoading(false);
        break;
      }
    }
  }

  function addEvent(message: string) {
    setEvents((prev) => [...prev, message]);
  }

  function handleConfirmTaskSelection(selectedTaskIds: string[]) {
    const selectedTasks = tasks.filter((t) => selectedTaskIds.includes(t.id));
    setTasks(selectedTasks);
    setSessionStartedAt(new Date().toISOString());
    setSessionState("session");
  }

  function handleRegenerateTasks() {
    if (!sessionId) return;

    setTasks([]);
    setEvents([]);
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    setSessionState("planning");
    setIsLoading(true);
    connectToEvents(sessionId);
  }

  async function handleToggleTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    const status = task.status === "completed" ? "pending" : "completed";
    await patchTask(taskId, { status });
  }

  async function handleEndSession() {
    if (!sessionId) return;

    setIsLoading(true);

    try {
      const response = await fetch(API.sessionEnd(sessionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      setSummary(data.summary || "Session completed.");
      setSessionMetrics(data.metrics || null);
      setSessionState("summary");
      void resumeAudioContext()
        .then(() => playSessionCompleteSound())
        .catch(() => {});
    } catch (error) {
      console.error("Failed to end session:", error);
      const completed = tasks.filter((t) => t.status === "completed").length;
      setSummary(`Completed ${completed} of ${tasks.length} tasks.`);
      setSessionMetrics(null);
      setSessionState("summary");
      void resumeAudioContext()
        .then(() => playSessionCompleteSound())
        .catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewSession() {
    if (eventSource) {
      eventSource.close();
    }
    resetSession();
    setEvents([]);
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    setSelectedWorkspaceId("");
  }

  async function handleCancelSession() {
    if (eventSource) {
      eventSource.close();
    }

    if (sessionId) {
      try {
        await fetch(API.sessionCancel(sessionId), { method: "POST" });
      } catch (error) {
        console.error("Failed to cancel session:", error);
      }
    }

    setIsLoading(false);
    setEvents([]);
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    resetSession();
  }

  function handleStartSessionWithIdea(steps: string[], title: string) {
    setActiveView("session");
    setUserGoal(title);
    // Pre-fill with the idea's steps as a goal, then let user start normally
  }

  const showTaskNav = sessionState === "session" && tasks.length > 0;

  function handleOpenWorkspaceManager() {
    if (eventSource) {
      eventSource.close();
    }
    setShowWorkspaceManager(true);
  }

  return (
    <AppShell
      active={activeView === "improve" ? "improve" : "session"}
      showTaskNav={showTaskNav}
      onManageWorkspaces={handleOpenWorkspaceManager}
      onNavigateImprove={() => setActiveView(activeView === "improve" ? "session" : "improve")}
    >
      {showWorkspaceManager && (
        <WorkspaceManager
          workspaces={workspaces}
          onWorkspacesChange={loadWorkspaces}
          onClose={() => setShowWorkspaceManager(false)}
        />
      )}

      {activeView === "improve" && (
        <ImproveView
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={setSelectedWorkspaceId}
          onStartSessionWithIdea={handleStartSessionWithIdea}
        />
      )}

      {activeView === "session" && sessionState === "start" && (
        <StartView
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={setSelectedWorkspaceId}
          userGoal={userGoal}
          onChangeGoal={setUserGoal}
          timeBudget={timeBudget}
          onChangeTimeBudget={setTimeBudget}
          focusWeights={focusWeights}
          onChangeFocusWeights={setFocusWeights}
          onStart={handleStartSession}
          onManageWorkspaces={handleOpenWorkspaceManager}
          isLoading={isLoading}
        />
      )}

      {activeView === "session" && sessionState === "planning" && (
        <PlanningView
          events={events}
          isLoading={isLoading}
          errorMessage={planningError}
          onCancel={handleCancelSession}
        />
      )}

      {activeView === "session" && sessionState === "task_selection" && (
        <TaskSelectionView
          tasks={tasks}
          timeBudget={timeBudget}
          userGoal={userGoal}
          onConfirmSelection={handleConfirmTaskSelection}
          onRegenerate={handleRegenerateTasks}
          onAddTask={createTaskFromApi}
          onGenerateChecklist={generateChecklistFromApi}
          isLoading={isLoading}
        />
      )}

      {activeView === "session" && sessionState === "session" && (
        <SessionView
          tasks={tasks}
          timeBudget={timeBudget}
          userGoal={userGoal}
          sessionStartedAt={sessionStartedAt}
          onToggleTask={handleToggleTask}
          onAddTask={createTaskFromApi}
          onGenerateChecklist={generateChecklistFromApi}
          onEndSession={handleEndSession}
          isLoading={isLoading}
        />
      )}

      {activeView === "session" && sessionState === "summary" && (
        <SummaryView
          tasks={tasks}
          summary={summary}
          metrics={sessionMetrics}
          userGoal={userGoal}
          onNewSession={handleNewSession}
        />
      )}
    </AppShell>
  );
}
