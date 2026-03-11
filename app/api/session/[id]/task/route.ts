import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  getSession,
  getTask,
  createSessionTask,
  listSessionTasks,
  updateSessionTask,
} from "@/server/db/queries";
import type { CreateTaskRequest, UpdateTaskRequest } from "@/server/types/domain";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import {
  createTaskRequestSchema,
  updateTaskRequestSchema,
} from "@/server/validation/api";
import { serializeSessionTask } from "@/server/serializers/session";

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
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return secureError("Session not found", 404);
    }

    const tasks = await listSessionTasks(sessionId);
    return secureJson({ tasks: tasks.map(serializeSessionTask) });
  } catch (error) {
    console.error("Failed to list tasks:", error);
    return secureError("Failed to list tasks", 500);
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
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id: sessionId } = await params;
    const parsedBody = await readJsonBody<CreateTaskRequest>(
      request,
      createTaskRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;

    const session = await getSession(sessionId);
    if (!session) {
      return secureError("Session not found", 404);
    }

    const existingTasks = await listSessionTasks(sessionId);
    const order = existingTasks.length;

    const taskId = generateTaskId();
    const now = new Date();

    const task = await createSessionTask({
      id: taskId,
      sessionId,
      title: body.title.trim(),
      description: body.description?.trim() ? body.description.trim() : null,
      estimatedMinutes: body.estimatedMinutes ?? null,
      status: "pending",
      checklist: body.checklist ? JSON.stringify(body.checklist) : null,
      context: body.context ? JSON.stringify(body.context) : null,
      order,
      createdAt: now,
    });

    return secureJson({ task: serializeSessionTask(task) }, 201);
  } catch (error) {
    console.error("Failed to create task:", error);
    return secureError("Failed to create task", 500);
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
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const { id: sessionId } = await params;
    const parsedBody = await readJsonBody(request, updateTaskRequestSchema);
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;

    const session = await getSession(sessionId);
    if (!session) {
      return secureError("Session not found", 404);
    }

    const existingTask = await getTask(body.taskId);
    if (!existingTask) {
      return secureError("Task not found", 404);
    }
    if (existingTask.sessionId !== sessionId) {
      console.warn(
        `[Security] IDOR attempt: task ${body.taskId} belongs to session ${existingTask.sessionId}, not ${sessionId}`
      );
      return secureError("Task does not belong to this session", 403);
    }

    const task = await updateSessionTask(body.taskId, {
      status: body.status,
      title: body.title !== undefined ? body.title.trim() : undefined,
      description:
        body.description === undefined
          ? undefined
          : body.description === null || !body.description.trim()
            ? null
            : body.description.trim(),
      estimatedMinutes: body.estimatedMinutes,
      notes:
        body.notes === undefined
          ? undefined
          : body.notes === null || !body.notes.trim()
            ? null
            : body.notes.trim(),
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
    });

    if (!task) {
      return secureError("Task not found", 404);
    }

    return secureJson({ task: serializeSessionTask(task) });
  } catch (error) {
    console.error("Failed to update task:", error);
    return secureError("Failed to update task", 500);
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
