"use client";

import { useCallback, useEffect, useState } from "react";
import {
  playWarningSound as playWarningSfx,
  playTimeoutSound as playTimeoutSfx,
  resumeAudioContext,
} from "@/lib/audio";

interface SessionTimerProps {
  timeBudgetMinutes: number;
  sessionStartedAt: string | null;
  onTimeout?: () => void;
}

type WarningState = {
  tenMinute: boolean;
  fiveMinute: boolean;
  timeout: boolean;
};

function formatTime(totalSeconds: number): string {
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${isNegative ? "-" : ""}${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${isNegative ? "-" : ""}${pad(minutes)}:${pad(seconds)}`;
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

function showNotification(title: string, body: string) {
  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "session-timer",
      requireInteraction: true,
    });
  }
}

export default function SessionTimer({
  timeBudgetMinutes,
  sessionStartedAt,
  onTimeout,
}: SessionTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [warningsShown, setWarningsShown] = useState<WarningState>({
    tenMinute: false,
    fiveMinute: false,
    timeout: false,
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioResumed, setAudioResumed] = useState(false);

  const budgetSeconds = timeBudgetMinutes * 60;
  const remainingSeconds = budgetSeconds - elapsedSeconds;
  const isOvertime = remainingSeconds < 0;
  const remainingMinutes = Math.ceil(remainingSeconds / 60);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission().then(setNotificationsEnabled);
  }, []);

  // Resume audio context on first user interaction
  useEffect(() => {
    if (audioResumed) return;

    const handleInteraction = () => {
      resumeAudioContext().then(() => setAudioResumed(true));
    };

    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("keydown", handleInteraction, { once: true });

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, [audioResumed]);

  const playWarningSound = useCallback(() => {
    if (soundEnabled) {
      playWarningSfx();
    }
  }, [soundEnabled]);

  const playTimeoutSound = useCallback(() => {
    if (soundEnabled) {
      playTimeoutSfx();
    }
  }, [soundEnabled]);

  // Timer interval
  useEffect(() => {
    if (!sessionStartedAt) {
      return;
    }

    const startTime = new Date(sessionStartedAt).getTime();

    const updateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(elapsed);
    };

    // Initial update
    updateElapsed();

    // Update every second
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [sessionStartedAt]);

  // Handle warnings and timeout
  useEffect(() => {
    // 10-minute warning
    if (
      remainingMinutes <= 10 &&
      remainingMinutes > 5 &&
      !warningsShown.tenMinute &&
      remainingSeconds > 0
    ) {
      setWarningsShown((prev) => ({ ...prev, tenMinute: true }));
      playWarningSound();
      if (notificationsEnabled) {
        showNotification(
          "10 minutes remaining",
          "Your session is almost over. Time to wrap up!"
        );
      }
    }

    // 5-minute warning
    if (
      remainingMinutes <= 5 &&
      remainingMinutes > 0 &&
      !warningsShown.fiveMinute &&
      remainingSeconds > 0
    ) {
      setWarningsShown((prev) => ({ ...prev, fiveMinute: true }));
      playWarningSound();
      if (notificationsEnabled) {
        showNotification(
          "5 minutes remaining",
          "Final stretch! Start wrapping up your current task."
        );
      }
    }

    // Timeout
    if (remainingSeconds <= 0 && !warningsShown.timeout) {
      setWarningsShown((prev) => ({ ...prev, timeout: true }));
      playTimeoutSound();
      if (notificationsEnabled) {
        showNotification(
          "Session time is up!",
          "Your budgeted time has ended. Consider wrapping up."
        );
      }
      onTimeout?.();
    }
  }, [
    remainingMinutes,
    remainingSeconds,
    warningsShown,
    notificationsEnabled,
    playWarningSound,
    playTimeoutSound,
    onTimeout,
  ]);

  const toggleSound = () => setSoundEnabled((prev) => !prev);

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
    } else {
      setNotificationsEnabled(false);
    }
  };

  // Calculate progress percentage (capped at 100 for visual)
  const progressPercent = Math.min((elapsedSeconds / budgetSeconds) * 100, 100);

  return (
    <div className="session-timer">
      <div className="timer-display">
        <div className="timer-countdown-section">
          <span className="timer-label">Remaining</span>
          <span className={`timer-countdown ${isOvertime ? "overtime" : ""}`}>
            {formatTime(remainingSeconds)}
          </span>
        </div>
        <div className="timer-elapsed-section">
          <span className="timer-label">Elapsed</span>
          <span className="timer-elapsed">{formatElapsed(elapsedSeconds)}</span>
        </div>
      </div>

      <div className="timer-progress">
        <div
          className={`timer-progress-fill ${isOvertime ? "overtime" : ""}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="timer-controls">
        <button
          type="button"
          className={`timer-control-btn ${soundEnabled ? "active" : ""}`}
          onClick={toggleSound}
          title={soundEnabled ? "Mute sounds" : "Enable sounds"}
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>
        <button
          type="button"
          className={`timer-control-btn ${notificationsEnabled ? "active" : ""}`}
          onClick={toggleNotifications}
          title={
            notificationsEnabled
              ? "Disable notifications"
              : "Enable notifications"
          }
        >
          {notificationsEnabled ? "🔔" : "🔕"}
        </button>
      </div>

      {isOvertime && (
        <div className="timer-overtime-badge">
          Session overtime by {formatTime(Math.abs(remainingSeconds))}
        </div>
      )}
    </div>
  );
}
