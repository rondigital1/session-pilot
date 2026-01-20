"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  SessionState,
  FocusWeights,
  UIWorkspace,
  UITask,
  SSEEvent,
} from "@/server/types/domain";

/**
 * SessionPilot - Single Page Application
 *
 * States:
 * 1. Start - Select workspace, set time budget, focus sliders, enter goal
 * 2. Planning - SSE events show scanning progress and task generation
 * 3. Session - Work through tasks, check them off
 * 4. Summary - View session summary, save for tomorrow
 *
 * TODO(SessionPilot): Connect to real API endpoints.
 * Currently uses mock data for scaffolding demonstration.
 */

export default function HomePage() {
  // Current UI state
  const [state, setState] = useState<SessionState>("start");

  // Session configuration
  const [workspaces, setWorkspaces] = useState<UIWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [userGoal, setUserGoal] = useState<string>("");
  const [timeBudget, setTimeBudget] = useState<number>(60);
  const [focusWeights, setFocusWeights] = useState<FocusWeights>({
    bugs: 0.5,
    features: 0.5,
    refactor: 0.3,
  });

  // Session data
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<UITask[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces();
  }, []);

  /**
   * Load workspaces from API
   */
  async function loadWorkspaces() {
    try {
      const response = await fetch("/api/workspaces");
      const data = await response.json();
      setWorkspaces(data.workspaces || []);

      // If no workspaces, add a mock one for demo
      if (!data.workspaces || data.workspaces.length === 0) {
        setWorkspaces([
          {
            id: "demo_workspace",
            name: "Demo Workspace",
            localPath: "/path/to/project",
            githubRepo: "user/repo",
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to load workspaces:", error);
      // Add demo workspace on error
      setWorkspaces([
        {
          id: "demo_workspace",
          name: "Demo Workspace",
          localPath: "/path/to/project",
          githubRepo: "user/repo",
        },
      ]);
    }
  }

  /**
   * Start a new session
   *
   * TODO(SessionPilot): Connect to /api/session/start endpoint
   */
  async function handleStartSession() {
    if (!selectedWorkspaceId || !userGoal) {
      return;
    }

    setIsLoading(true);
    setEvents([]);
    setState("planning");

    try {
      // Call start session API
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

      // Connect to SSE for events
      connectToEvents(data.sessionId);
    } catch (error) {
      console.error("Failed to start session:", error);
      addEvent(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      // For demo, proceed with mock data
      setSessionId("mock_session");
      simulateMockPlanning();
    }
  }

  /**
   * Connect to SSE endpoint for session events
   *
   * TODO(SessionPilot): Implement proper error handling and reconnection
   */
  function connectToEvents(sessionId: string) {
    const eventSource = new EventSource(`/api/session/${sessionId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        handleSSEEvent(data);
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      // For demo, continue with mock data if SSE fails
      if (state === "planning" && tasks.length === 0) {
        simulateMockPlanning();
      }
    };
  }

  /**
   * Handle incoming SSE event
   */
  function handleSSEEvent(event: SSEEvent) {
    const time = new Date(event.timestamp).toLocaleTimeString();

    switch (event.type) {
      case "scan_started":
      case "scan_progress":
      case "scan_completed":
        addEvent(`[${time}] ${(event.data as { message?: string }).message || event.type}`);
        break;

      case "planning_started":
        addEvent(`[${time}] Generating session plan...`);
        break;

      case "task_generated": {
        const taskData = event.data as {
          id: string;
          title: string;
          description?: string;
          estimatedMinutes?: number;
        };
        setTasks((prev) => [
          ...prev,
          {
            id: taskData.id,
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
        // Auto-transition to session after brief delay
        setTimeout(() => {
          setState("session");
        }, 1000);
        break;

      case "error":
        addEvent(`[${time}] Error: ${(event.data as { message?: string }).message}`);
        break;
    }
  }

  /**
   * Add event to log
   */
  function addEvent(message: string) {
    setEvents((prev) => [...prev, message]);
  }

  /**
   * Simulate planning for demo when API is not available
   */
  function simulateMockPlanning() {
    const mockEvents = [
      "Scanning local repository...",
      "Found 3 TODO comments",
      "Checking GitHub issues...",
      "Found 2 open issues",
      "Generating session plan...",
    ];

    const mockTasks: UITask[] = [
      {
        id: "task_1",
        title: "Fix failing test in auth module",
        description: "The login test is failing due to a mock issue",
        estimatedMinutes: 15,
        status: "pending",
      },
      {
        id: "task_2",
        title: "Address TODO in user service",
        description: "Implement proper error handling",
        estimatedMinutes: 20,
        status: "pending",
      },
      {
        id: "task_3",
        title: "Review PR #42",
        description: "Colleague requested code review",
        estimatedMinutes: 25,
        status: "pending",
      },
    ];

    // Simulate events over time
    let delay = 500;
    mockEvents.forEach((msg) => {
      setTimeout(() => {
        addEvent(`[${new Date().toLocaleTimeString()}] ${msg}`);
      }, delay);
      delay += 600;
    });

    // Add tasks
    setTimeout(() => {
      setTasks(mockTasks);
      addEvent(`[${new Date().toLocaleTimeString()}] Planning complete!`);
      setIsLoading(false);

      setTimeout(() => {
        setState("session");
      }, 1000);
    }, delay);
  }

  /**
   * Toggle task completion
   *
   * TODO(SessionPilot): Call /api/session/[id]/task PATCH endpoint
   */
  async function handleToggleTask(taskId: string) {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          const newStatus = task.status === "completed" ? "pending" : "completed";
          return { ...task, status: newStatus };
        }
        return task;
      })
    );

    // TODO(SessionPilot): Sync with API
    // await fetch(`/api/session/${sessionId}/task`, {
    //   method: 'PATCH',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ taskId, status: newStatus })
    // });
  }

  /**
   * End the current session
   *
   * TODO(SessionPilot): Call /api/session/[id]/end endpoint
   */
  async function handleEndSession() {
    setIsLoading(true);

    try {
      if (sessionId && sessionId !== "mock_session") {
        const response = await fetch(`/api/session/${sessionId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const data = await response.json();
        setSummary(data.summary);
      } else {
        // Mock summary
        const completed = tasks.filter((t) => t.status === "completed").length;
        setSummary(
          `Session focused on: "${userGoal}". Completed ${completed} of ${tasks.length} tasks. ` +
            (completed < tasks.length
              ? `Remaining: ${tasks.filter((t) => t.status !== "completed").map((t) => t.title).join(", ")}.`
              : "All planned tasks completed!")
        );
      }

      setState("summary");
    } catch (error) {
      console.error("Failed to end session:", error);
      // Generate mock summary anyway
      const completed = tasks.filter((t) => t.status === "completed").length;
      setSummary(`Completed ${completed} of ${tasks.length} tasks.`);
      setState("summary");
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Start a new session (reset state)
   */
  function handleNewSession() {
    setState("start");
    setSessionId(null);
    setTasks([]);
    setEvents([]);
    setSummary("");
    setUserGoal("");
  }

  // Render based on current state
  return (
    <div className="container">
      <header className="header">
        <h1>SessionPilot</h1>
        <p>Plan and track your daily coding sessions</p>
      </header>

      {state === "start" && (
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
          isLoading={isLoading}
        />
      )}

      {state === "planning" && (
        <PlanningView events={events} isLoading={isLoading} />
      )}

      {state === "session" && (
        <SessionView
          tasks={tasks}
          timeBudget={timeBudget}
          userGoal={userGoal}
          onToggleTask={handleToggleTask}
          onEndSession={handleEndSession}
          isLoading={isLoading}
        />
      )}

      {state === "summary" && (
        <SummaryView
          tasks={tasks}
          summary={summary}
          userGoal={userGoal}
          onNewSession={handleNewSession}
        />
      )}
    </div>
  );
}

// =============================================================================
// View Components
// =============================================================================

interface StartViewProps {
  workspaces: UIWorkspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  userGoal: string;
  onChangeGoal: (goal: string) => void;
  timeBudget: number;
  onChangeTimeBudget: (minutes: number) => void;
  focusWeights: FocusWeights;
  onChangeFocusWeights: (weights: FocusWeights) => void;
  onStart: () => void;
  isLoading: boolean;
}

function StartView({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  userGoal,
  onChangeGoal,
  timeBudget,
  onChangeTimeBudget,
  focusWeights,
  onChangeFocusWeights,
  onStart,
  isLoading,
}: StartViewProps) {
  const canStart = selectedWorkspaceId && userGoal.trim().length > 0;

  return (
    <div className="card">
      <h2 className="card-title">Start New Session</h2>

      <div className="form-group">
        <label className="form-label">Workspace</label>
        <select
          className="form-select"
          value={selectedWorkspaceId}
          onChange={(e) => onSelectWorkspace(e.target.value)}
        >
          <option value="">Select a workspace...</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name} ({ws.localPath})
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">What are you working on today?</label>
        <textarea
          className="form-textarea"
          placeholder="e.g., Implement user authentication, fix the checkout bug..."
          value={userGoal}
          onChange={(e) => onChangeGoal(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Time Budget: {timeBudget} minutes</label>
        <input
          type="range"
          className="slider"
          min="15"
          max="120"
          step="15"
          value={timeBudget}
          onChange={(e) => onChangeTimeBudget(Number(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Focus Areas</label>

        <div className="slider-group">
          <div className="slider-header">
            <span className="slider-label">Bug Fixes</span>
            <span className="slider-value">{Math.round(focusWeights.bugs * 100)}%</span>
          </div>
          <input
            type="range"
            className="slider"
            min="0"
            max="1"
            step="0.1"
            value={focusWeights.bugs}
            onChange={(e) =>
              onChangeFocusWeights({ ...focusWeights, bugs: Number(e.target.value) })
            }
          />
        </div>

        <div className="slider-group">
          <div className="slider-header">
            <span className="slider-label">New Features</span>
            <span className="slider-value">{Math.round(focusWeights.features * 100)}%</span>
          </div>
          <input
            type="range"
            className="slider"
            min="0"
            max="1"
            step="0.1"
            value={focusWeights.features}
            onChange={(e) =>
              onChangeFocusWeights({ ...focusWeights, features: Number(e.target.value) })
            }
          />
        </div>

        <div className="slider-group">
          <div className="slider-header">
            <span className="slider-label">Refactoring</span>
            <span className="slider-value">{Math.round(focusWeights.refactor * 100)}%</span>
          </div>
          <input
            type="range"
            className="slider"
            min="0"
            max="1"
            step="0.1"
            value={focusWeights.refactor}
            onChange={(e) =>
              onChangeFocusWeights({ ...focusWeights, refactor: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <button
        className="btn btn-primary btn-full mt-2"
        onClick={onStart}
        disabled={!canStart || isLoading}
      >
        {isLoading ? "Starting..." : "Start Session"}
      </button>
    </div>
  );
}

interface PlanningViewProps {
  events: string[];
  isLoading: boolean;
}

function PlanningView({ events, isLoading }: PlanningViewProps) {
  return (
    <div className="card">
      <div className="flex justify-between items-center mb-2">
        <h2 className="card-title" style={{ marginBottom: 0 }}>
          Planning Session
        </h2>
        <span className="badge badge-planning">
          {isLoading ? "Scanning..." : "Ready"}
        </span>
      </div>

      {isLoading && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: "60%", animation: "pulse 1.5s infinite" }}
          />
        </div>
      )}

      <div className="events-log">
        {events.length === 0 ? (
          <div className="event-item">Connecting to session...</div>
        ) : (
          events.map((event, i) => (
            <div key={i} className="event-item">
              {event}
            </div>
          ))
        )}
      </div>

      <p className="text-muted text-sm mt-2">
        Scanning your codebase and GitHub for signals...
      </p>
    </div>
  );
}

interface SessionViewProps {
  tasks: UITask[];
  timeBudget: number;
  userGoal: string;
  onToggleTask: (taskId: string) => void;
  onEndSession: () => void;
  isLoading: boolean;
}

function SessionView({
  tasks,
  timeBudget,
  userGoal,
  onToggleTask,
  onEndSession,
  isLoading,
}: SessionViewProps) {
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div>
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            Session Active
          </h2>
          <span className="badge badge-active">In Progress</span>
        </div>

        <p className="text-muted text-sm mb-2">Goal: {userGoal}</p>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <p className="text-sm text-muted">
          {completedCount} of {tasks.length} tasks completed • {timeBudget} min budget
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Tasks</h3>

        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-item">
              <input
                type="checkbox"
                className="task-checkbox"
                checked={task.status === "completed"}
                onChange={() => onToggleTask(task.id)}
              />
              <div className="task-content">
                <div
                  className={`task-title ${task.status === "completed" ? "completed" : ""}`}
                >
                  {task.title}
                </div>
                {task.description && (
                  <div className="task-description">{task.description}</div>
                )}
              </div>
              {task.estimatedMinutes && (
                <span className="task-time">{task.estimatedMinutes} min</span>
              )}
            </li>
          ))}
        </ul>

        {tasks.length === 0 && (
          <p className="text-muted text-center">No tasks generated</p>
        )}
      </div>

      <button
        className="btn btn-success btn-full mt-2"
        onClick={onEndSession}
        disabled={isLoading}
      >
        {isLoading ? "Ending..." : "End Session"}
      </button>
    </div>
  );
}

interface SummaryViewProps {
  tasks: UITask[];
  summary: string;
  userGoal: string;
  onNewSession: () => void;
}

function SummaryView({ tasks, summary, userGoal, onNewSession }: SummaryViewProps) {
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

  return (
    <div>
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            Session Complete
          </h2>
          <span className="badge badge-completed">Done</span>
        </div>

        <p className="text-muted text-sm mb-2">Goal: {userGoal}</p>

        <div className="summary-box">
          <div className="summary-stat">
            <span className="summary-label">Tasks Completed</span>
            <span className="summary-value">
              {completedCount} / {tasks.length}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Time Allocated</span>
            <span className="summary-value">{totalMinutes} min</span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">Completion Rate</span>
            <span className="summary-value">
              {tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Summary for Tomorrow</h3>
        <p className="text-sm">{summary}</p>
        <p className="text-muted text-sm mt-2">
          This summary will be shown at the start of your next session.
        </p>
      </div>

      <button className="btn btn-primary btn-full mt-2" onClick={onNewSession}>
        Start New Session
      </button>
    </div>
  );
}
