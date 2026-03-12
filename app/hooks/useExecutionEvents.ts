"use client";

import { useEffect, useRef, useState } from "react";
import { API } from "@/app/utils/api-routes";
import type { ExecutionEventRecord } from "@/server/types/domain";

function isHeartbeatEvent(event: ExecutionEventRecord): boolean {
  if (typeof event.data !== "object" || event.data === null) {
    return false;
  }

  return Boolean((event.data as { heartbeat?: boolean }).heartbeat);
}

function isTerminalEvent(event: ExecutionEventRecord): boolean {
  return event.type === "completed" || event.type === "failed" || event.type === "cancelled";
}

export function useExecutionEvents(executionId: string) {
  const [events, setEvents] = useState<ExecutionEventRecord[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const terminalRef = useRef(false);

  useEffect(() => {
    if (!executionId) {
      return;
    }

    setEvents([]);
    setConnectionError(null);
    setIsConnected(false);
    reconnectAttemptRef.current = 0;
    terminalRef.current = false;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed || terminalRef.current) {
        return;
      }

      eventSource = new EventSource(API.executionEvents(executionId));

      eventSource.onopen = () => {
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        setConnectionError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as ExecutionEventRecord;

          if (isHeartbeatEvent(parsed)) {
            return;
          }

          if (isTerminalEvent(parsed)) {
            terminalRef.current = true;
          }

          setEvents((current) => {
            if (current.some((item) => item.id === parsed.id)) {
              return current;
            }

            return [...current, parsed];
          });
          setConnectionError(null);
        } catch (error) {
          setConnectionError(error instanceof Error ? error.message : String(error));
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource?.close();

        if (disposed || terminalRef.current) {
          return;
        }

        reconnectAttemptRef.current += 1;
        const delayMs = Math.min(1000 * reconnectAttemptRef.current, 5000);
        setConnectionError(
          reconnectAttemptRef.current > 1
            ? `Execution stream reconnecting (attempt ${reconnectAttemptRef.current})…`
            : "Execution stream reconnecting…"
        );

        reconnectTimer = setTimeout(() => {
          connect();
        }, delayMs);
      };
    };

    connect();

    return () => {
      disposed = true;
      eventSource?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [executionId]);

  return {
    events,
    connectionError,
    isConnected,
    lastEvent: events[events.length - 1] ?? null,
  };
}
