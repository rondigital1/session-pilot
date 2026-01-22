/**
 * Planning Workflow Orchestrator
 *
 * Orchestrates the full session planning workflow:
 * 1. Scans local repository for signals (TODOs, git changes, etc.)
 * 2. Optionally scans GitHub for issues, PRs, and commits
 * 3. Stores signals in the database
 * 4. Generates a session plan using Claude
 * 5. Stores generated tasks in the database
 * 6. Emits SSE events throughout the process
 */

import type { FocusWeights, ScanSignal } from "@/server/types/domain";
import type { Workspace } from "@/server/db/schema";
import { scanLocalRepository } from "@/server/scanners/localScan";
import { scanGitHubRepository, parseGitHubRepo } from "@/server/scanners/githubScan";
import { storeSignals, createSessionTasksBulk, updateSessionStatus } from "@/server/db/queries";
import { generateSessionPlan } from "./sessionPlanner";
import { emitSessionEvent, completeSession } from "@/lib/session/events";

export interface PlanningWorkflowOptions {
  sessionId: string;
  workspace: Workspace;
  userGoal: string;
  timeBudgetMinutes: number;
  focusWeights: FocusWeights;
}

/**
 * Run the full planning workflow asynchronously
 *
 * This function is designed to be called without awaiting - it runs in the
 * background and emits SSE events as it progresses.
 */
export async function runPlanningWorkflow(
  options: PlanningWorkflowOptions
): Promise<void> {
  const { sessionId, workspace, userGoal, timeBudgetMinutes, focusWeights } = options;

  console.log(`[PlanningWorkflow] Starting for session ${sessionId}`);
  console.log(`[PlanningWorkflow] Workspace: ${workspace.localPath ?? "(GitHub only)"}`);

  try {
    // Validate workspace path exists (if provided)
    if (workspace.localPath) {
      const fs = await import("fs/promises");
      try {
        const stats = await fs.stat(workspace.localPath);
        if (!stats.isDirectory()) {
          throw new Error(`Workspace path is not a directory: ${workspace.localPath}`);
        }
        console.log(`[PlanningWorkflow] Workspace validated successfully`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[PlanningWorkflow] Workspace validation failed: ${message}`);
        await emitSessionEvent(sessionId, "error", {
          code: "INVALID_WORKSPACE",
          message: `Cannot access workspace: ${message}`,
        });
        await completeSession(sessionId);
        return;
      }
    }

    console.log(`[PlanningWorkflow] Emitting scan_started event`);
    await emitSessionEvent(sessionId, "scan_started", {
      sessionId,
      message: "Starting codebase scan",
    });

    const allSignals: ScanSignal[] = [];

    // Run local scan (only if localPath is provided)
    if (workspace.localPath) {
      await emitSessionEvent(sessionId, "scan_progress", {
        source: "local",
        message: "Scanning local repository...",
        progress: 0.1,
      });

      const localResult = await scanLocalRepository({
        workspacePath: workspace.localPath,
        sessionId,
        includeTests: false,
      });

      allSignals.push(...localResult.signals);

      await emitSessionEvent(sessionId, "scan_progress", {
        source: "local",
        message: `Found ${localResult.signals.length} local signals (${localResult.scannedFiles} files scanned)`,
        progress: 1.0,
      });

      if (localResult.errors.length > 0) {
        await emitSessionEvent(sessionId, "error", {
          code: "LOCAL_SCAN_PARTIAL",
          message: `Local scan completed with errors: ${localResult.errors.join(", ")}`,
        });
      }
    }

    // Run GitHub scan if configured
    if (workspace.githubRepo) {
      const parsed = parseGitHubRepo(workspace.githubRepo);

      if (parsed) {
        await emitSessionEvent(sessionId, "scan_progress", {
          source: "github",
          message: "Fetching GitHub issues and PRs...",
          progress: 0.3,
        });

        const githubResult = await scanGitHubRepository({
          owner: parsed.owner,
          repo: parsed.repo,
          sessionId,
          includeIssues: true,
          includePRs: true,
          includePRComments: true,  // Fetch review comments for actionable feedback
          includeRecentCommits: true,
          maxIssues: 10,       // Reduced from 20 to minimize token usage
          maxPRs: 5,           // Reduced from 10 to minimize token usage
          maxPRComments: 10,   // Limit PR comments to avoid token bloat
        });

        allSignals.push(...githubResult.signals);

        await emitSessionEvent(sessionId, "scan_progress", {
          source: "github",
          message: `Found ${githubResult.signals.length} GitHub signals`,
          progress: 1.0,
        });

        if (githubResult.errors.length > 0) {
          await emitSessionEvent(sessionId, "error", {
            code: "GITHUB_SCAN_PARTIAL",
            message: `GitHub scan completed with errors: ${githubResult.errors.join(", ")}`,
          });
        }
      } else {
        await emitSessionEvent(sessionId, "error", {
          code: "INVALID_GITHUB_REPO",
          message: `Could not parse GitHub repo: ${workspace.githubRepo}`,
        });
      }
    }

    // Store signals in database
    await emitSessionEvent(sessionId, "scan_completed", {
      message: `Scan complete. Found ${allSignals.length} signals.`,
      signalCount: allSignals.length,
    });

    if (allSignals.length > 0) {
      const signalsToStore = allSignals.map((signal) => ({
        id: signal.id,
        sessionId,
        source: signal.source,
        signalType: signal.signalType,
        title: signal.title,
        description: signal.description,
        filePath: signal.filePath,
        url: signal.url,
        priority: signal.priority,
        metadata: signal.metadata ? JSON.stringify(signal.metadata) : null,
        createdAt: new Date(),
      }));
      await storeSignals(signalsToStore);
    }

    // Generate session plan
    await emitSessionEvent(sessionId, "planning_started", {
      message: "Generating session plan with AI...",
    });

    const plannedTasks = await generateSessionPlan({
      signals: allSignals.map((s) => ({
        id: s.id,
        signalType: s.signalType,
        title: s.title,
        description: s.description,
        priority: s.priority,
      })),
      userGoal,
      timeBudgetMinutes,
      focusWeights,
    });

    // Store tasks and emit events
    const tasksToCreate = plannedTasks.map((task, index) => ({
      id: `task_${sessionId}_${index + 1}`,
      sessionId,
      title: task.title,
      description: task.description,
      estimatedMinutes: task.estimatedMinutes,
      order: index,
      status: "pending" as const,
      createdAt: new Date(),
    }));

    const createdTasks = await createSessionTasksBulk(tasksToCreate);

    // Emit task_generated events for each task
    for (const task of createdTasks) {
      await emitSessionEvent(sessionId, "task_generated", {
        taskId: task.id,
        title: task.title,
        description: task.description,
        estimatedMinutes: task.estimatedMinutes,
      });
    }

    // Calculate total estimated time
    const totalEstimatedMinutes = createdTasks.reduce(
      (sum, task) => sum + (task.estimatedMinutes ?? 0),
      0
    );

    // Update session to active
    await updateSessionStatus(sessionId, "active");

    await emitSessionEvent(sessionId, "planning_completed", {
      message: "Planning complete. Ready to start session.",
      taskCount: createdTasks.length,
      totalEstimatedMinutes,
    });

    await emitSessionEvent(sessionId, "session_started", {
      sessionId,
      taskCount: createdTasks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await emitSessionEvent(sessionId, "error", {
      code: "PLANNING_FAILED",
      message: `Planning workflow failed: ${message}`,
    });

    // Update session status to indicate failure
    await updateSessionStatus(sessionId, "cancelled").catch(() => {});
  } finally {
    await completeSession(sessionId);
  }
}
