"use client";

import { useEffect, useState } from "react";
import type { SSEEvent, UIWorkspace } from "@/server/types/domain";
import AppShell from "./components/AppShell";
import StartView from "./components/StartView";
import PlanningView from "./components/PlanningView";
import TaskSelectionView from "./components/TaskSelectionView";
import SessionView from "./components/SessionView";
import SummaryView from "./components/SummaryView";
import WorkspaceManager from "./components/WorkspaceManager";
import { useSession } from "./session-context";

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

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<UIWorkspace[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [showWorkspaceManager, setShowWorkspaceManager] = useState<boolean>(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

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
    sessionStartedAt,
    setSessionStartedAt,
    syncTasksFromApi,
    createTaskFromApi,
    patchTask,
    resetSession,
  } = useSession();

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
    if (sessionId && sessionState === "planning" && !eventSource) {
      console.log("[SSE Client] Reconnecting to session after page load");
      setIsLoading(true);
      connectToEvents(sessionId);
    }
  }, [sessionId, sessionState, eventSource]);
  
  // If we have tasks while in planning state, planning already completed - advance to task selection
  useEffect(() => {
    if (sessionState === "planning" && tasks.length > 0 && !isLoading) {
      console.log("[Session] Planning complete with tasks, advancing to task selection");
      setSessionState("task_selection");
    }
  }, [sessionState, tasks.length, isLoading, setSessionState]);

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  async function loadWorkspaces() {
    try {
      const response = await fetch("/api/workspaces");
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
    setSessionState("planning");

    try {
      const response = await fetch("/api/session/start", {
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
      addEvent(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsLoading(false);
      setSessionState("start");
    }
  }

  function connectToEvents(activeSessionId: string) {
    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
    }

    const eventUrl = `/api/session/${activeSessionId}/events`;
    console.log(`[SSE Client] Connecting to ${eventUrl}`);
    const es = new EventSource(eventUrl);
    setEventSource(es);
    
    // Track connection status
    let hasConnected = false;
    let hasReceivedEvents = false;
    let hasCompletedNormally = false;
    let errorCount = 0;

    es.onopen = () => {
      hasConnected = true;
      errorCount = 0;
      console.log("SSE connection opened");
    };

    es.onmessage = (event) => {
      hasReceivedEvents = true;
      try {
        const data: SSEEvent = JSON.parse(event.data);
        // Track if we received a terminal event (session completed normally)
        if (data.type === "planning_completed" || data.type === "session_ended") {
          hasCompletedNormally = true;
        }
        handleSSEEvent(data);
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    es.onerror = () => {
      errorCount++;
      const state = es.readyState;
      
      // If session completed normally, any subsequent error/close is expected
      if (hasCompletedNormally) {
        console.log("SSE connection closed after session completed");
        es.close();
        setEventSource(null);
        return;
      }
      
      // If EventSource is reconnecting (CONNECTING state), let it retry silently
      // EventSource auto-reconnects, so only log on first attempt or when closed
      if (state === EventSource.CONNECTING && hasReceivedEvents) {
        // Already received events, EventSource is just reconnecting - this is normal
        // Don't log as error, just let it retry
        return;
      }
      
      // Only log true errors (never connected, or connection permanently closed)
      if (state === EventSource.CLOSED || !hasConnected) {
        const stateStr = state === EventSource.CONNECTING ? "CONNECTING" : 
                         state === EventSource.OPEN ? "OPEN" : "CLOSED";
        console.error(`SSE connection failed. ReadyState: ${stateStr}, errorCount: ${errorCount}`);
        
        es.close();
        setEventSource(null);
        
        // Only show error to user if we never received any events
        if (!hasReceivedEvents) {
          addEvent("Connection lost. Please try again.");
          setIsLoading(false);
          setSessionState("start");
        }
      }
    };
  }

  function handleSSEEvent(event: SSEEvent) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "connected":
        addEvent(`[${time}] Connected to session`);
        break;

      case "heartbeat":
        // Ignore heartbeat events in the UI
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
        setTasks((prev) => [
          ...prev,
          {
            id: taskData.taskId,
            title: taskData.title,
            description: taskData.description,
            estimatedMinutes: taskData.estimatedMinutes,
            status: "pending",
          },
        ]);
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
        const endData = event.data as { cancelled?: boolean };
        if (endData.cancelled) {
          addEvent(`[${time}] Session cancelled`);
        }
        // Close event source
        if (eventSource) {
          eventSource.close();
          setEventSource(null);
        }
        break;
      }

      case "error": {
        const errorData = event.data as { code?: string; message?: string };
        addEvent(`[${time}] Error: ${errorData.message || "Unknown error"}`);
        setIsLoading(false);
        // If this is a critical error (like invalid workspace), allow retry
        if (errorData.code === "INVALID_WORKSPACE" || errorData.code === "PLANNING_FAILED") {
          // Keep in planning state to show the error, user can cancel to retry
        }
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
      const response = await fetch(`/api/session/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      setSummary(data.summary || "Session completed.");
      setSessionState("summary");
    } catch (error) {
      console.error("Failed to end session:", error);
      const completed = tasks.filter((t) => t.status === "completed").length;
      setSummary(`Completed ${completed} of ${tasks.length} tasks.`);
      setSessionState("summary");
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewSession() {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    resetSession();
    setEvents([]);
    setSelectedWorkspaceId("");
  }

  async function handleCancelSession() {
    // Close event source first
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }

    // Call cancel API if we have a session
    if (sessionId) {
      try {
        await fetch(`/api/session/${sessionId}/cancel`, { method: "POST" });
      } catch (error) {
        console.error("Failed to cancel session:", error);
      }
    }

    setIsLoading(false);
    setEvents([]);
    resetSession();
  }

  const showTaskNav = sessionState === "session" && tasks.length > 0;

  function handleOpenWorkspaceManager() {
    // Close any active SSE connection before managing workspaces
    // to prevent errors if a workspace with an active session is deleted
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setShowWorkspaceManager(true);
  }

  return (
    <AppShell
      active="session"
      showTaskNav={showTaskNav}
      onManageWorkspaces={handleOpenWorkspaceManager}
    >
      {showWorkspaceManager && (
        <WorkspaceManager
          workspaces={workspaces}
          onWorkspacesChange={loadWorkspaces}
          onClose={() => setShowWorkspaceManager(false)}
        />
      )}

      {sessionState === "start" && (
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

      {sessionState === "planning" && (
        <PlanningView
          events={events}
          isLoading={isLoading}
          onCancel={handleCancelSession}
        />
      )}

      {sessionState === "task_selection" && (
        <TaskSelectionView
          tasks={tasks}
          timeBudget={timeBudget}
          userGoal={userGoal}
          onConfirmSelection={handleConfirmTaskSelection}
          onRegenerate={handleRegenerateTasks}
          onAddTask={createTaskFromApi}
          isLoading={isLoading}
        />
      )}

      {sessionState === "session" && (
        <SessionView
          tasks={tasks}
          timeBudget={timeBudget}
          userGoal={userGoal}
          sessionStartedAt={sessionStartedAt}
          onToggleTask={handleToggleTask}
          onAddTask={createTaskFromApi}
          onEndSession={handleEndSession}
          isLoading={isLoading}
        />
      )}

      {sessionState === "summary" && (
        <SummaryView
          tasks={tasks}
          summary={summary}
          userGoal={userGoal}
          onNewSession={handleNewSession}
        />
      )}
    </AppShell>
  );
}
