import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  createSessionTask,
  listSessionTasks,
  updateTaskStatus,
} from "@/server/db/queries";
import type {
  CreateTaskRequest,
  UpdateTaskRequest,
  UITaskChecklistItem,
  UITaskContext,
} from "@/server/types/domain";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * GET /api/session/[id]/task
 * List all tasks for a session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const tasks = await listSessionTasks(sessionId);
    return NextResponse.json({
      tasks: tasks.map((task) => ({
        ...task,
        checklist: parseChecklist(task.checklist),
        context: parseContext(task.context),
      })),
    });
  } catch (error) {
    console.error("Failed to list tasks:", error);
    return NextResponse.json(
      { error: "Failed to list tasks" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/session/[id]/task
 * Create a new task for a session
 *
 * Request body:
 * {
 *   title: string,
 *   description?: string,
 *   estimatedMinutes?: number
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body: CreateTaskRequest = await request.json();

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Validate required fields
    if (!body.title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    // Get current task count for ordering
    const existingTasks = await listSessionTasks(sessionId);
    const order = existingTasks.length;

    const taskId = generateTaskId();
    const now = new Date();

    const task = await createSessionTask({
      id: taskId,
      sessionId,
      title: body.title,
      description: body.description || null,
      estimatedMinutes: body.estimatedMinutes || null,
      status: "pending",
      checklist: body.checklist ? JSON.stringify(body.checklist) : null,
      context: body.context ? JSON.stringify(body.context) : null,
      order,
      createdAt: now,
    });

    return NextResponse.json(
      {
        task: {
          ...task,
          checklist: parseChecklist(task.checklist),
          context: parseContext(task.context),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/session/[id]/task
 * Update a task's status or notes
 *
 * Request body:
 * {
 *   taskId: string,
 *   status: "pending" | "in_progress" | "completed" | "skipped",
 *   notes?: string
 * }
 *
 * TODO(SessionPilot): Consider moving this to /api/session/[id]/task/[taskId]
 * for more RESTful routing.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body: UpdateTaskRequest & { taskId: string } = await request.json();

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Validate required fields
    if (!body.taskId || !body.status) {
      return NextResponse.json(
        { error: "taskId and status are required" },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ["pending", "in_progress", "completed", "skipped"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // TODO(SessionPilot): Validate that the task belongs to this session.
    // Currently we trust the taskId without verification.

    const task = await updateTaskStatus(
      body.taskId,
      body.status,
      body.notes,
      body.checklist ? JSON.stringify(body.checklist) : undefined,
      body.context ? JSON.stringify(body.context) : undefined
    );

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      task: task
        ? {
            ...task,
            checklist: parseChecklist(task.checklist),
            context: parseContext(task.context),
          }
        : task,
    });
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseChecklist(value: string | null): UITaskChecklistItem[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseContext(value: string | null): UITaskContext | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as UITaskContext;
    return parsed;
  } catch {
    return undefined;
  }
}
