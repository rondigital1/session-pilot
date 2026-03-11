import type { SessionState } from "@/server/types/domain";

interface SessionWorkflowBarProps {
  sessionState: SessionState;
}

const STAGES: Array<{ key: SessionState; label: string; helper: string }> = [
  {
    key: "start",
    label: "Create",
    helper: "Choose a workspace and describe the outcome you want.",
  },
  {
    key: "planning",
    label: "Plan",
    helper: "SessionPilot scans signals and assembles a focused session draft.",
  },
  {
    key: "task_selection",
    label: "Start",
    helper: "Select the tasks that fit the session before committing to work.",
  },
  {
    key: "session",
    label: "Execute",
    helper: "Track progress, capture notes, and leave the session open if you need to pause.",
  },
  {
    key: "summary",
    label: "Review",
    helper: "Wrap up what moved, what remains, and what to carry forward.",
  },
];

export default function SessionWorkflowBar({
  sessionState,
}: SessionWorkflowBarProps) {
  const activeIndex = STAGES.findIndex((stage) => stage.key === sessionState);
  const currentStage = STAGES[Math.max(activeIndex, 0)];

  return (
    <section className="workflow-bar panel">
      <div className="workflow-track" aria-label="Session workflow">
        {STAGES.map((stage, index) => {
          const isCurrent = index === activeIndex;
          const isComplete = index < activeIndex;

          return (
            <div
              key={stage.key}
              className={`workflow-step ${isCurrent ? "current" : ""} ${isComplete ? "complete" : ""}`}
            >
              <span className="workflow-step-index">{index + 1}</span>
              <div>
                <div className="workflow-step-label">{stage.label}</div>
                <div className="workflow-step-key">{stage.key.replace("_", " ")}</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="workflow-helper">{currentStage.helper}</p>
    </section>
  );
}
