import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getSession,
  getTask,
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
import { validateCsrfProtection, addSecurityHeaders } from "@/lib/security";

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
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    const tasks = await listSessionTasks(sessionId);
    return addSecurityHeaders(
      NextResponse.json({
        tasks: tasks.map((task) => ({
          ...task,
          checklist: parseChecklist(task.checklist),
          context: parseContext(task.context),
        })),
      })
    );
  } catch (error) {
    console.error("Failed to list tasks:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to list tasks" }, { status: 500 })
    );
  }
}

/**
 * POST /api/session/[id]/task
 * Create a new task for a session
 *
 * SECURITY: Protected by CSRF validation
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
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const { id: sessionId } = await params;
    const body: CreateTaskRequest = await request.json();

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Validate required fields
    if (!body.title) {
      return addSecurityHeaders(
        NextResponse.json({ error: "title is required" }, { status: 400 })
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

    return addSecurityHeaders(
      NextResponse.json(
        {
          task: {
            ...task,
            checklist: parseChecklist(task.checklist),
            context: parseContext(task.context),
          },
        },
        { status: 201 }
      )
    );
  } catch (error) {
    console.error("Failed to create task:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to create task" }, { status: 500 })
    );
  }
}

/**
 * PATCH /api/session/[id]/task
 * Update a task's status or notes
 *
 * SECURITY: Protected by CSRF validation and IDOR check
 *
 * Request body:
 * {
 *   taskId: string,
 *   status: "pending" | "in_progress" | "completed" | "skipped",
 *   notes?: string
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Validate CSRF protection
  const csrfError = validateCsrfProtection(request);
  if (csrfError) {
    return addSecurityHeaders(csrfError);
  }

  try {
    const { id: sessionId } = await params;
    const body: UpdateTaskRequest & { taskId: string } = await request.json();

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Validate required fields
    if (!body.taskId || !body.status) {
      return addSecurityHeaders(
        NextResponse.json({ error: "taskId and status are required" }, { status: 400 })
      );
    }

    // Validate status value
    const validStatuses = ["pending", "in_progress", "completed", "skipped"];
    if (!validStatuses.includes(body.status)) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: `status must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        )
      );
    }

    // SECURITY: Verify task belongs to this session (IDOR protection)
    const existingTask = await getTask(body.taskId);
    if (!existingTask) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Task not found" }, { status: 404 })
      );
    }
    if (existingTask.sessionId !== sessionId) {
      // Log potential attack attempt
      console.warn(
        `[Security] IDOR attempt: task ${body.taskId} belongs to session ${existingTask.sessionId}, not ${sessionId}`
      );
      return addSecurityHeaders(
        NextResponse.json({ error: "Task does not belong to this session" }, { status: 403 })
      );
    }

    const task = await updateTaskStatus(
      body.taskId,
      body.status,
      body.notes,
      body.checklist ? JSON.stringify(body.checklist) : undefined,
      body.context ? JSON.stringify(body.context) : undefined
    );

    if (!task) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Task not found" }, { status: 404 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        task: {
          ...task,
          checklist: parseChecklist(task.checklist),
          context: parseContext(task.context),
        },
      })
    );
  } catch (error) {
    console.error("Failed to update task:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to update task" }, { status: 500 })
    );
  }
}

/**
 * Generate a cryptographically secure task ID
 * 
 * SECURITY: Uses crypto.randomUUID() for unpredictable IDs
 */
function generateTaskId(): string {
  return `task_${randomUUID()}`;
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
