import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupGitWorkspace,
  prepareGitWorkspace,
} from "@/server/execution/gitWorkspaceService";

const execFileAsync = promisify(execFile);

async function runGit(repoPath: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: repoPath,
  });

  return result.stdout;
}

describe("gitWorkspaceService", () => {
  let repoPath: string;
  let worktreeRoot: string;
  let previousWorktreeRoot: string | undefined;

  beforeEach(async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sessionpilot-git-"));
    repoPath = path.join(tempRoot, "repo");
    worktreeRoot = path.join(tempRoot, "worktrees");
    previousWorktreeRoot = process.env.SESSIONPILOT_WORKTREE_ROOT;

    await fs.mkdir(repoPath, { recursive: true });
    await runGit(repoPath, ["init"]);
    await runGit(repoPath, ["config", "user.email", "sessionpilot@example.com"]);
    await runGit(repoPath, ["config", "user.name", "SessionPilot"]);
    await fs.writeFile(path.join(repoPath, "README.md"), "# Repo\n");
    await runGit(repoPath, ["add", "README.md"]);
    await runGit(repoPath, ["commit", "-m", "Initial commit"]);

    process.env.SESSIONPILOT_WORKTREE_ROOT = worktreeRoot;
  });

  afterEach(async () => {
    if (previousWorktreeRoot === undefined) {
      delete process.env.SESSIONPILOT_WORKTREE_ROOT;
    } else {
      process.env.SESSIONPILOT_WORKTREE_ROOT = previousWorktreeRoot;
    }

    await fs.rm(path.dirname(repoPath), { recursive: true, force: true });
  });

  it("creates and cleans up isolated worktrees inside the configured root", async () => {
    const workspace = await prepareGitWorkspace(repoPath, "execution/../unsafe");

    expect(workspace.worktreePath.startsWith(worktreeRoot)).toBe(true);
    expect(await fs.stat(workspace.worktreePath)).toBeTruthy();
    expect(workspace.branchName).toContain("execution-unsafe");

    const branchListBeforeCleanup = await runGit(repoPath, [
      "branch",
      "--list",
      workspace.branchName,
    ]);
    expect(branchListBeforeCleanup).toContain(workspace.branchName);

    await cleanupGitWorkspace(repoPath, workspace);

    await expect(fs.stat(workspace.worktreePath)).rejects.toThrow();

    const branchListAfterCleanup = await runGit(repoPath, [
      "branch",
      "--list",
      workspace.branchName,
    ]);
    expect(branchListAfterCleanup.trim()).toBe("");
  });
});
