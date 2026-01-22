/**
 * Server-Sent Events (SSE) helper utilities
 */

import type { SSEEvent, SSEEventType } from "@/server/types/domain";

/**
 * Create an SSE event with timestamp
 */
export function createEvent(type: SSEEventType, data: unknown): SSEEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * Create an SSE event sender for a stream controller
 */
export function createEventSender(controller: ReadableStreamDefaultController) {
  const encoder = new TextEncoder();

  return (event: SSEEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(encoder.encode(data));
  };
}

/**
 * Sleep utility for delays between events
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely close a stream controller
 */
export function safeClose(controller: ReadableStreamDefaultController): void {
  try {
    controller.close();
  } catch {
    // Controller already closed
  }
}
