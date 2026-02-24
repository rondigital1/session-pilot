"use client";

import { useState, useEffect } from "react";
import type { SSEEvent } from "@/server/types/domain";
import { API } from "@/app/utils/api-routes";

const TERMINAL_PLANNING_ERROR_CODES = new Set([
  "INVALID_WORKSPACE",
  "PLANNING_FAILED",
  "POLL_ERROR",
]);

function isTerminalPlanningError(code?: string): boolean {
  if (!code) return false;
  return TERMINAL_PLANNING_ERROR_CODES.has(code);
}

interface UseSessionEventsOptions {
  onEvent: (event: SSEEvent) => void;
  onConnected?: () => void;
  onError?: (message: string) => void;
  onStreamComplete?: () => void;
  onClosed?: () => void;
}

interface UseSessionEventsResult {
  eventSource: EventSource | null;
  planningError: string | null;
  isPlanningStreamComplete: boolean;
  connectToEvents: (sessionId: string) => void;
  setPlanningError: (error: string | null) => void;
  setIsPlanningStreamComplete: (complete: boolean) => void;
}

export function useSessionEvents(
  options: UseSessionEventsOptions
): UseSessionEventsResult {
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [isPlanningStreamComplete, setIsPlanningStreamComplete] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  function connectToEvents(activeSessionId: string) {
    if (eventSource) {
      eventSource.close();
    }

    const eventUrl = API.sessionEvents(activeSessionId);
    console.log(`[SSE Client] Connecting to ${eventUrl}`);
    const es = new EventSource(eventUrl);
    setEventSource(es);

    let hasConnected = false;
    let hasReceivedEvents = false;
    let hasCompletedNormally = false;
    let errorCount = 0;

    es.onopen = () => {
      hasConnected = true;
      errorCount = 0;
      console.log("SSE connection opened");
      options.onConnected?.();
    };

    es.onmessage = (event) => {
      hasReceivedEvents = true;
      try {
        const data: SSEEvent = JSON.parse(event.data);
        if (data.type === "planning_completed" || data.type === "session_ended") {
          hasCompletedNormally = true;
        }

        // Handle stream-level state updates inline
        switch (data.type) {
          case "planning_completed":
            setPlanningError(null);
            setIsPlanningStreamComplete(true);
            break;

          case "session_ended": {
            const endData = data.data as { cancelled?: boolean; streamComplete?: boolean };
            if (endData.streamComplete) {
              setIsPlanningStreamComplete(true);
            }
            setEventSource((activeEs) => {
              if (activeEs) activeEs.close();
              return null;
            });
            break;
          }

          case "error": {
            const errorData = data.data as { code?: string; message?: string };
            if (isTerminalPlanningError(errorData.code)) {
              setPlanningError(errorData.message || "Unknown error");
              setIsPlanningStreamComplete(true);
            }
            break;
          }
        }

        options.onEvent(data);
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    es.onerror = () => {
      errorCount++;
      const state = es.readyState;

      if (hasCompletedNormally) {
        console.log("SSE connection closed after session completed");
        es.close();
        setEventSource(null);
        return;
      }

      if (state === EventSource.CONNECTING && hasReceivedEvents) {
        return;
      }

      if (state === EventSource.CLOSED || !hasConnected) {
        const stateStr =
          state === EventSource.CONNECTING
            ? "CONNECTING"
            : state === EventSource.OPEN
            ? "OPEN"
            : "CLOSED";
        console.error(
          `SSE connection failed. ReadyState: ${stateStr}, errorCount: ${errorCount}`
        );

        es.close();
        setEventSource(null);

        if (!hasReceivedEvents) {
          options.onError?.("Connection lost. Please try again.");
          options.onClosed?.();
        }
      }
    };
  }

  return {
    eventSource,
    planningError,
    isPlanningStreamComplete,
    connectToEvents,
    setPlanningError,
    setIsPlanningStreamComplete,
  };
}
