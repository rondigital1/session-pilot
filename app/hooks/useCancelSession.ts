"use client";

import { useCallback, useRef } from "react";

interface UseCancelSessionOptions {
  sessionId: string | null;
  onCancelled?: () => void;
  onError?: (error: Error) => void;
}

interface UseCancelSessionReturn {
  cancelSession: () => Promise<boolean>;
  isCancelling: boolean;
}

/**
 * Hook to cancel an in-progress session
 *
 * Usage:
 * ```tsx
 * const { cancelSession, isCancelling } = useCancelSession({
 *   sessionId,
 *   onCancelled: () => { ... },
 *   onError: (err) => { ... },
 * });
 * ```
 */
export function useCancelSession(
  _options: UseCancelSessionOptions
): UseCancelSessionReturn {
  const isCancellingRef = useRef(false);

  const cancelSession = useCallback(async (): Promise<boolean> => {
    // TODO: Implement cancel logic
    // 1. Set isCancelling state to true
    // 2. Call POST /api/session/{sessionId}/cancel
    // 3. Close any open EventSource connections
    // 4. Call onCancelled callback on success
    // 5. Call onError callback on failure
    // 6. Return success/failure boolean

    return false;
  }, []);

  return {
    cancelSession,
    isCancelling: isCancellingRef.current,
  };
}
