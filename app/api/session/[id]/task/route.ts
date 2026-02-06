import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getSession,
  getTask,
  createSessionTask,
  listSessionTasks,
  updateSessionTask,
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
 * Update task fields
 *
 * SECURITY: Protected by CSRF validation and IDOR check
 *
 * Request body:
 * {
 *   taskId: string,
 *   status?: "pending" | "in_progress" | "completed" | "skipped",
 *   title?: string,
 *   description?: string | null,
 *   estimatedMinutes?: number | null,
 *   notes?: string,
 *   checklist?: UITaskChecklistItem[],
 *   context?: UITaskContext
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
    const body = (await request.json()) as UpdateTaskRequest & {
      taskId?: string;
      notes?: string | null;
      checklist?: UITaskChecklistItem[] | null;
      context?: UITaskContext | null;
    };

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Validate required fields
    if (!body.taskId) {
      return addSecurityHeaders(
        NextResponse.json({ error: "taskId is required" }, { status: 400 })
      );
    }

    const hasUpdates =
      body.status !== undefined ||
      body.title !== undefined ||
      body.description !== undefined ||
      body.estimatedMinutes !== undefined ||
      body.notes !== undefined ||
      body.checklist !== undefined ||
      body.context !== undefined;

    if (!hasUpdates) {
      return addSecurityHeaders(
        NextResponse.json({ error: "No task updates provided" }, { status: 400 })
      );
    }

    // Validate status value
    const validStatuses = ["pending", "in_progress", "completed", "skipped"];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: `status must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        )
      );
    }

    if (body.title !== undefined && typeof body.title !== "string") {
      return addSecurityHeaders(
        NextResponse.json({ error: "title must be a string" }, { status: 400 })
      );
    }

    if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
      return addSecurityHeaders(
        NextResponse.json({ error: "description must be a string" }, { status: 400 })
      );
    }

    if (body.title !== undefined && !body.title.trim()) {
      return addSecurityHeaders(
        NextResponse.json({ error: "title cannot be empty" }, { status: 400 })
      );
    }

    if (body.estimatedMinutes !== undefined && body.estimatedMinutes !== null) {
      const isValidEstimate =
        Number.isFinite(body.estimatedMinutes) &&
        body.estimatedMinutes >= 1 &&
        body.estimatedMinutes <= 480;

      if (!isValidEstimate) {
        return addSecurityHeaders(
          NextResponse.json(
            { error: "estimatedMinutes must be between 1 and 480" },
            { status: 400 }
          )
        );
      }
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

    const task = await updateSessionTask(
      body.taskId,
      {
        status: body.status,
        title: body.title !== undefined ? body.title.trim() : undefined,
        description:
          body.description === undefined
            ? undefined
            : body.description === null || !body.description.trim()
              ? null
              : body.description.trim(),
        estimatedMinutes: body.estimatedMinutes,
        notes: body.notes,
        checklist:
          body.checklist === undefined
            ? undefined
            : body.checklist === null
              ? null
              : JSON.stringify(body.checklist),
        context:
          body.context === undefined
            ? undefined
            : body.context === null
              ? null
              : JSON.stringify(body.context),
      }
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
