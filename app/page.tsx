"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SessionState,
  SessionStatus,
  SSEEvent,
  SystemHealthReport,
  UISession,
  UISessionHistoryItem,
  UITask,
  UIWorkspace,
} from "@/server/types/domain";
import AppShell from "./components/AppShell";
import StartView from "./components/StartView";
import PlanningView from "./components/PlanningView";
import TaskSelectionView from "./components/TaskSelectionView";
import SessionView from "./components/SessionView";
import SummaryView from "./components/SummaryView";
import ImproveView from "./components/ImproveView";
import WorkspaceManager from "./components/WorkspaceManager";
import SessionWorkflowBar from "./components/SessionWorkflowBar";
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
const SESSION_HISTORY_LIMIT = 8;

function isCarryForwardTask(task: UITask) {
  return task.status === "pending" || task.status === "in_progress";
}

function buildIdeaDraftGoal(title: string, steps: string[]) {
  const cleanTitle = title.trim();
  const cleanSteps = steps.map((step) => step.trim()).filter(Boolean);

  if (cleanSteps.length === 0) {
    return cleanTitle;
  }

  return `${cleanTitle}\n\nSuggested steps:\n${cleanSteps
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n")}`;
}

function buildFollowUpGoal(goal: string, pendingTasks: UITask[]) {
  const cleanGoal = goal.trim() || "Follow up on open tasks";
  const carryForward = pendingTasks
    .filter(isCarryForwardTask)
    .slice(0, 5)
    .map((task) => `- ${task.title}`);

  if (carryForward.length === 0) {
    return cleanGoal;
  }

  return `${cleanGoal}\n\nCarry forward:\n${carryForward.join("\n")}`;
}

function taskHasExecutionEvidence(task: UITask) {
  return Boolean(
    task.status !== "pending" ||
      task.notes?.trim() ||
      task.checklist?.some((item) => item.done)
  );
}

function getRecoveredSessionState(session: UISession): SessionState {
  if (session.status === "completed") {
    return "summary";
  }

  if (session.status === "planning") {
    return "planning";
  }

  if (session.tasks.some(taskHasExecutionEvidence)) {
    return "session";
  }

  return "task_selection";
}

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<UIWorkspace[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [showWorkspaceManager, setShowWorkspaceManager] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<AppView>("session");
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SessionStatus>("completed");
  const [sessionHistory, setSessionHistory] = useState<UISessionHistoryItem[]>([]);
  const [isLoadingSessionHistory, setIsLoadingSessionHistory] = useState(false);
  const [sessionHistoryError, setSessionHistoryError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthReport | null>(null);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const lastRecoveryTaskSyncSessionId = useRef<string | null>(null);

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
      setStartError(message);
      setSessionState("start");
    },
    onClosed: () => {
      setIsLoading(false);
      setSessionState("start");
    },
  });

  useEffect(() => {
    loadWorkspaces();
    void loadSystemHealth();
  }, []);

  useEffect(() => {
    if (workspaces.length === 1 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id);
      return;
    }

    if (
      selectedWorkspaceId &&
      !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    ) {
      setSelectedWorkspaceId(workspaces.length === 1 ? workspaces[0].id : "");
    }
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setSessionHistory([]);
      setSessionHistoryError(null);
      return;
    }

    void loadWorkspaceSessions(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!sessionId) {
      lastRecoveryTaskSyncSessionId.current = null;
      return;
    }

    if (tasks.length > 0 || sessionState === "start" || sessionState === "planning") {
      return;
    }

    if (lastRecoveryTaskSyncSessionId.current === sessionId) {
      return;
    }

    lastRecoveryTaskSyncSessionId.current = sessionId;
    void syncTasksFromApi();
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
      const response = await fetch(API.workspaces, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load workspaces");
      }
      setWorkspaces(data.workspaces || []);
      setWorkspaceLoadError(null);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
      setWorkspaces([]);
      setWorkspaceLoadError("Unable to load saved workspaces right now.");
    }
  }

  async function loadSystemHealth() {
    try {
      const response = await fetch(API.health, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok && !data.status) {
        throw new Error(data.error || "Failed to load system health");
      }

      setSystemHealth(data);
      setSystemHealthError(
        response.ok
          ? null
          : "System preflight reported a blocking issue. Review the warnings below before a live demo."
      );
    } catch (error) {
      console.error("Failed to load system health:", error);
      setSystemHealth(null);
      setSystemHealthError(
        "Preflight checks are unavailable. Verify environment variables before a live demo."
      );
    }
  }

  async function loadWorkspaceSessions(workspaceId: string) {
    setIsLoadingSessionHistory(true);

    try {
      const response = await fetch(
        `${API.workspaceSessions(workspaceId)}?limit=${SESSION_HISTORY_LIMIT}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load session history");
      }

      setSessionHistory(data.sessions || []);
      setSessionHistoryError(null);
    } catch (error) {
      console.error("Failed to load workspace sessions:", error);
      setSessionHistory([]);
      setSessionHistoryError("Unable to load recent sessions for this workspace.");
    } finally {
      setIsLoadingSessionHistory(false);
    }
  }

  async function loadSessionFromServer(activeSessionId: string) {
    const response = await fetch(API.session(activeSessionId), {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load session");
    }

    return data.session as UISession;
  }

  async function handleStartSession() {
    if (!selectedWorkspaceId || !userGoal.trim()) {
      setStartError(
        !selectedWorkspaceId && !userGoal.trim()
          ? "Choose a workspace and write a clear goal before starting."
          : !selectedWorkspaceId
            ? "Choose a workspace before starting the session."
            : "Describe what you want to accomplish before starting."
      );
      return;
    }

    setIsLoading(true);
    setEvents([]);
    setTasks([]);
    setStartError(null);
    setStartNotice(null);
    setSessionError(null);
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
      setStartError(message);
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

  function returnToStart(options?: {
    goal?: string;
    notice?: string | null;
    preservePreferences?: boolean;
  }) {
    if (eventSource) {
      eventSource.close();
    }

    const nextTimeBudget = timeBudget;
    const nextFocusWeights = focusWeights;

    resetSession();
    setActiveView("session");
    setEvents([]);
    setIsLoading(false);
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    setStartError(null);
    setSessionError(null);
    setStartNotice(options?.notice ?? null);
    setSummaryStatus("completed");

    if (options?.preservePreferences !== false) {
      setTimeBudget(nextTimeBudget);
      setFocusWeights(nextFocusWeights);
    }

    setUserGoal(options?.goal ?? "");
  }

  function hydrateLoadedSession(session: UISession, nextState: SessionState) {
    if (eventSource) {
      eventSource.close();
    }

    setActiveView("session");
    setSessionId(session.id);
    setSelectedWorkspaceId(session.workspaceId);
    setUserGoal(session.userGoal);
    setTimeBudget(session.timeBudgetMinutes);
    setFocusWeights(session.focusWeights);
    setTasks(session.tasks);
    setSummary(
      session.summary ||
        (nextState === "summary"
          ? "No completion summary was saved for this session."
          : "")
    );
    setSessionMetrics(session.metrics || null);
    setSessionStartedAt(session.startedAt);
    setEvents([]);
    setStartError(null);
    setStartNotice(null);
    setSessionError(null);
    setSummaryStatus(nextState === "summary" ? session.status : "completed");
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    setSessionState(nextState);
  }

  function handleConfirmTaskSelection(selectedTaskIds: string[]) {
    const selectedTasks = tasks.filter((t) => selectedTaskIds.includes(t.id));
    setTasks(selectedTasks);
    setSessionStartedAt(new Date().toISOString());
    setSessionError(null);
    setSessionState("session");
  }

  function handleRegenerateTasks() {
    if (!sessionId) return;

    setTasks([]);
    setEvents([]);
    addEvent("Reloading the latest planning output...");
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
    const updated = await patchTask(taskId, { status });
    if (!updated) {
      setSessionError("We couldn't update that task. Refresh the session or try again.");
      return;
    }

    setSessionError(null);
  }

  async function handleEndSession() {
    if (!sessionId) return;

    setIsLoading(true);
    setSessionError(null);

    try {
      const response = await fetch(API.sessionEnd(sessionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to end session");
      }
      setSummary(data.summary || "Session completed.");
      setSessionMetrics(data.metrics || null);
      setSummaryStatus("completed");
      setSessionState("summary");
      if (selectedWorkspaceId) {
        void loadWorkspaceSessions(selectedWorkspaceId);
      }
      void resumeAudioContext()
        .then(() => playSessionCompleteSound())
        .catch(() => {});
    } catch (error) {
      console.error("Failed to end session:", error);
      const message = error instanceof Error ? error.message : "Failed to end session";
      setSessionError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewSession() {
    returnToStart({
      notice: "Ready for the next session. Adjust the goal and keep going.",
    });
  }

  async function handleCancelSession() {
    if (sessionId) {
      try {
        await fetch(API.sessionCancel(sessionId), { method: "POST" });
      } catch (error) {
        console.error("Failed to cancel session:", error);
      }
    }

    returnToStart({
      goal: userGoal,
      notice: "Planning was stopped. You can refine the goal and try again.",
    });

    if (selectedWorkspaceId) {
      void loadWorkspaceSessions(selectedWorkspaceId);
    }
  }

  async function handleResumeSession(historySession: UISessionHistoryItem) {
    setIsLoading(true);
    setStartError(null);
    setSessionError(null);
    let keepPlanningSpinner = false;

    try {
      const loadedSession = await loadSessionFromServer(historySession.id);
      const nextState = getRecoveredSessionState(loadedSession);

      hydrateLoadedSession(loadedSession, nextState);

      if (nextState === "planning") {
        keepPlanningSpinner = true;
        setEvents([
          loadedSession.tasks.length > 0
            ? "Reconnected to planning. Existing tasks will stay visible while new events stream in."
            : "Reconnected to planning. Waiting for the planner to finish...",
        ]);
        connectToEvents(loadedSession.id);
      }
    } catch (error) {
      console.error("Failed to resume session:", error);
      setStartError(
        error instanceof Error
          ? error.message
          : "Unable to resume that session right now."
      );
      setSessionState("start");
    } finally {
      if (!keepPlanningSpinner) {
        setIsLoading(false);
      }
    }
  }

  async function handleReviewSession(historySession: UISessionHistoryItem) {
    setIsLoading(true);
    setStartError(null);

    try {
      const loadedSession = await loadSessionFromServer(historySession.id);
      hydrateLoadedSession(loadedSession, "summary");
    } catch (error) {
      console.error("Failed to review session:", error);
      setStartError(
        error instanceof Error
          ? error.message
          : "Unable to load that session summary right now."
      );
      setSessionState("start");
    } finally {
      setIsLoading(false);
    }
  }

  function handleLeaveSessionOpen() {
    returnToStart({
      notice:
        "Session left open. Resume it from the session history panel when you want to pick the work back up.",
    });

    if (selectedWorkspaceId) {
      void loadWorkspaceSessions(selectedWorkspaceId);
    }
  }

  function handlePlanFollowUp() {
    const followUpGoal = buildFollowUpGoal(userGoal, tasks);

    returnToStart({
      goal: followUpGoal,
      notice:
        "Open tasks were copied into a follow-up draft so you can start the next session with context.",
    });

    if (selectedWorkspaceId) {
      void loadWorkspaceSessions(selectedWorkspaceId);
    }
  }

  function handleStartSessionWithIdea(steps: string[], title: string) {
    const hasExistingDraft =
      sessionState !== "start" || Boolean(sessionId) || tasks.length > 0;

    if (
      hasExistingDraft &&
      !window.confirm(
        "Replace the current session draft in this browser with this improvement idea?"
      )
    ) {
      return false;
    }

    if (eventSource) {
      eventSource.close();
    }

    resetSession();
    setEvents([]);
    setPlanningError(null);
    setIsPlanningStreamComplete(false);
    setActiveView("session");
    setSessionState("start");
    setSummaryStatus("completed");
    setUserGoal(buildIdeaDraftGoal(title, steps));
    setStartError(null);
    setSessionError(null);
    setStartNotice(
      "Idea details were copied into the goal field so you can review and start planning from the Session tab."
    );

    return true;
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

      {activeView === "session" && <SessionWorkflowBar sessionState={sessionState} />}

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
          errorMessage={startError}
          workspaceLoadError={workspaceLoadError}
          prefillMessage={startNotice}
          systemHealth={systemHealth}
          systemHealthError={systemHealthError}
          sessionHistory={sessionHistory}
          isLoadingSessionHistory={isLoadingSessionHistory}
          sessionHistoryError={sessionHistoryError}
          onResumeSession={handleResumeSession}
          onReviewSession={handleReviewSession}
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
          plannerNotice="Need to refresh the task list? Reload planning output replays the latest plan stream instead of generating a brand new plan."
        />
      )}

      {activeView === "session" && sessionState === "session" && (
        <SessionView
          sessionId={sessionId}
          tasks={tasks}
          timeBudget={timeBudget}
          userGoal={userGoal}
          sessionStartedAt={sessionStartedAt}
          onToggleTask={handleToggleTask}
          onAddTask={createTaskFromApi}
          onGenerateChecklist={generateChecklistFromApi}
          onEndSession={handleEndSession}
          onLeaveOpen={handleLeaveSessionOpen}
          isLoading={isLoading}
          errorMessage={sessionError}
        />
      )}

      {activeView === "session" && sessionState === "summary" && (
        <SummaryView
          tasks={tasks}
          summary={summary}
          metrics={sessionMetrics}
          status={summaryStatus}
          userGoal={userGoal}
          onNewSession={handleNewSession}
          onPlanFollowUp={handlePlanFollowUp}
        />
      )}
    </AppShell>
  );
}
