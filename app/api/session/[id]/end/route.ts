import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  endSession,
  listSessionTasks,
} from "@/server/db/queries";
import type { EndSessionRequest, EndSessionResponse } from "@/server/types/domain";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/session/[id]/end
 * End a session and generate a summary
 *
 * Request body (optional):
 * {
 *   summary?: string  // Override the generated summary
 * }
 *
 * Response:
 * {
 *   sessionId: string,
 *   summary: string,
 *   tasksCompleted: number,
 *   tasksTotal: number
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    let body: EndSessionRequest = {};

    try {
      body = await request.json();
    } catch {
      // Body is optional, ignore parse errors
    }

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check session can be ended
    if (session.status === "completed" || session.status === "cancelled") {
      return NextResponse.json(
        { error: `Session is already ${session.status}` },
        { status: 400 }
      );
    }

    // Get task statistics
    const tasks = await listSessionTasks(sessionId);
    const tasksCompleted = tasks.filter((t) => t.status === "completed").length;
    const tasksTotal = tasks.length;

    // Generate or use provided summary
    let summary: string;
    if (body.summary) {
      summary = body.summary;
    } else {
      summary = await generateSessionSummary(session, tasks, tasksCompleted);
    }

    // Update session in database
    const updatedSession = await endSession(sessionId, summary);

    if (!updatedSession) {
      return NextResponse.json(
        { error: "Failed to end session" },
        { status: 500 }
      );
    }

    const response: EndSessionResponse = {
      sessionId,
      summary,
      tasksCompleted,
      tasksTotal,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to end session:", error);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}

/**
 * Generate a session summary
 *
 * TODO(SessionPilot): Implement AI-powered summary generation.
 * This should use the Claude agent to:
 * 1. Analyze which tasks were completed vs skipped
 * 2. Note any patterns or blockers
 * 3. Suggest what to pick up tomorrow
 * 4. Keep the summary concise (2-3 sentences)
 *
 * The summary should be stored and shown at the start of the next session
 * to provide continuity.
 */
async function generateSessionSummary(
  session: { userGoal: string; timeBudgetMinutes: number },
  tasks: Array<{ title: string; status: string; notes?: string | null }>,
  tasksCompleted: number
): Promise<string> {
  // TODO(SessionPilot): Replace with Claude agent call
  // Import and use server/agent/claudeClient.ts
  //
  // Example prompt:
  // "Generate a brief summary of this coding session.
  //  Goal: ${session.userGoal}
  //  Time budget: ${session.timeBudgetMinutes} minutes
  //  Tasks completed: ${tasksCompleted}/${tasks.length}
  //  Completed tasks: ${completedTasks.map(t => t.title).join(', ')}
  //  Skipped/pending: ${skippedTasks.map(t => t.title).join(', ')}
  //  Notes: ${tasks.filter(t => t.notes).map(t => t.notes).join(' | ')}
  //
  //  Write a 2-3 sentence summary for tomorrow."

  // For now, return a simple template-based summary
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const pendingTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );

  let summary = `Session focused on: "${session.userGoal}". `;
  summary += `Completed ${tasksCompleted} of ${tasks.length} tasks. `;

  if (pendingTasks.length > 0) {
    summary += `Remaining: ${pendingTasks.map((t) => t.title).join(", ")}.`;
  } else {
    summary += "All planned tasks completed!";
  }

  return summary;
}
