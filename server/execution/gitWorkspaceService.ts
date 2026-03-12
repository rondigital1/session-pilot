import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const DEFAULT_GIT_TIMEOUT_MS = 45_000;
const MAX_BUFFER = 10 * 1024 * 1024;
const SAFE_PATH = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";

export interface PreparedGitWorkspace {
  branchName: string;
  worktreePath: string;
  sourceCheckoutDirty: boolean;
}

export interface GitWorkspaceOptions {
  signal?: AbortSignal;
}

function slugifyRepoName(repoPath: string): string {
  const slug = path
    .basename(repoPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "repo";
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return sanitized || "execution";
}

function getWorktreeRoot(): string {
  const configuredRoot = process.env.SESSIONPILOT_WORKTREE_ROOT;
  if (configuredRoot) {
    return configuredRoot;
  }

  return path.join(os.homedir(), ".sessionpilot", "worktrees");
}

function getResolvedWorktreeRoot(): string {
  return path.resolve(getWorktreeRoot());
}

function createCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: SAFE_PATH,
  };
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason instanceof Error
    ? signal.reason
    : createAbortError("Git workspace operation was cancelled.");
}

function assertSafeWorktreePath(worktreePath: string): string {
  const resolvedRoot = getResolvedWorktreeRoot();
  const resolvedPath = path.resolve(worktreePath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe worktree path rejected: ${resolvedPath}`);
  }

  return resolvedPath;
}

async function runGitCommand(
  repoPath: string,
  args: string[],
  options: GitWorkspaceOptions = {},
  timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  ensureNotAborted(options.signal);

  const result = await execFileAsync("git", args, {
    cwd: repoPath,
    shell: false,
    timeout: timeoutMs,
    signal: options.signal,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    env: createCommandEnv(),
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function assertGitRepository(
  repoPath: string,
  options: GitWorkspaceOptions = {}
): Promise<void> {
  const result = await runGitCommand(
    repoPath,
    ["rev-parse", "--is-inside-work-tree"],
    options,
    15_000
  );

  if (result.stdout.trim() !== "true") {
    throw new Error(`Not a git repository: ${repoPath}`);
  }
}

async function isDirty(
  repoPath: string,
  options: GitWorkspaceOptions = {}
): Promise<boolean> {
  const result = await runGitCommand(
    repoPath,
    ["status", "--porcelain"],
    options,
    15_000
  );

  return result.stdout.trim().length > 0;
}

async function listTrackedWorktrees(
  repoPath: string,
  options: GitWorkspaceOptions = {}
): Promise<Set<string>> {
  const result = await runGitCommand(
    repoPath,
    ["worktree", "list", "--porcelain"],
    options,
    15_000
  );
  const tracked = new Set<string>();

  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) {
      continue;
    }

    tracked.add(await normalizeWorktreePath(line.slice("worktree ".length).trim()));
  }

  return tracked;
}

async function branchExists(
  repoPath: string,
  branchName: string,
  options: GitWorkspaceOptions = {}
): Promise<boolean> {
  try {
    await runGitCommand(
      repoPath,
      ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
      options,
      15_000
    );
    return true;
  } catch (error) {
    const commandError = error as { code?: number };
    if (commandError.code === 1) {
      return false;
    }

    throw error;
  }
}

async function removeFilesystemPath(worktreePath: string): Promise<void> {
  const resolvedPath = assertSafeWorktreePath(worktreePath);
  const stats = await fs.lstat(resolvedPath).catch(() => null);

  if (!stats) {
    return;
  }

  if (stats.isSymbolicLink()) {
    await fs.unlink(resolvedPath);
    return;
  }

  await fs.rm(resolvedPath, { recursive: true, force: true });
}

async function normalizeWorktreePath(worktreePath: string): Promise<string> {
  const resolvedPath = path.resolve(worktreePath);
  return fs.realpath(resolvedPath).catch(() => resolvedPath);
}

export async function prepareGitWorkspace(
  repoPath: string,
  executionId: string,
  options: GitWorkspaceOptions = {}
): Promise<PreparedGitWorkspace> {
  const resolvedRepoPath = path.resolve(repoPath);
  const repoSlug = slugifyRepoName(resolvedRepoPath);
  const safeExecutionId = sanitizePathSegment(executionId);
  const worktreePath = assertSafeWorktreePath(
    path.resolve(getResolvedWorktreeRoot(), repoSlug, safeExecutionId)
  );
  const branchName = `sessionpilot/${repoSlug}/${safeExecutionId}`;
  const sourceCheckoutDirty = await isDirty(resolvedRepoPath, options);

  await assertGitRepository(resolvedRepoPath, options);
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await cleanupGitWorkspace(
    resolvedRepoPath,
    {
      branchName,
      worktreePath,
    },
    options
  );
  await runGitCommand(
    resolvedRepoPath,
    ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
    options
  );
  ensureNotAborted(options.signal);

  return {
    branchName,
    worktreePath,
    sourceCheckoutDirty,
  };
}

export async function cleanupGitWorkspace(
  repoPath: string,
  workspace: Pick<PreparedGitWorkspace, "branchName" | "worktreePath">,
  options: GitWorkspaceOptions = {}
): Promise<void> {
  const resolvedRepoPath = path.resolve(repoPath);
  const resolvedWorktreePath = assertSafeWorktreePath(workspace.worktreePath);
  const normalizedWorktreePath = await normalizeWorktreePath(resolvedWorktreePath);

  await assertGitRepository(resolvedRepoPath, options);

  const trackedWorktrees = await listTrackedWorktrees(resolvedRepoPath, options);
  if (trackedWorktrees.has(normalizedWorktreePath)) {
    await runGitCommand(
      resolvedRepoPath,
      ["worktree", "remove", "--force", normalizedWorktreePath],
      options
    );
  }

  await removeFilesystemPath(resolvedWorktreePath);

  if (await branchExists(resolvedRepoPath, workspace.branchName, options)) {
    await runGitCommand(
      resolvedRepoPath,
      ["branch", "-D", workspace.branchName],
      options,
      15_000
    );
  }

  await runGitCommand(
    resolvedRepoPath,
    ["worktree", "prune"],
    options,
    15_000
  );
}
