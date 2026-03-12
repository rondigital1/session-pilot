import { randomUUID } from "crypto";
import { scanForRepositories } from "@/lib/workspace";
import {
  getLatestAnalysisRunForRepository,
  listRepoRoots,
  listRepositories,
  upsertRepository,
} from "@/server/db/queries";
import { serializeRepository } from "@/server/serializers/orchestrator";
import { runCommand } from "@/server/utils/shell";
import type { RepositoryInventoryItem } from "@/server/types/domain";

async function getGitMetadata(repoPath: string) {
  async function read(args: string[]): Promise<string | null> {
    try {
      const output = await runCommand("git", args, repoPath, 15000);
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  const [remoteOrigin, currentBranch, statusOutput, symbolicDefault] = await Promise.all([
    read(["config", "--get", "remote.origin.url"]),
    read(["rev-parse", "--abbrev-ref", "HEAD"]),
    read(["status", "--porcelain"]),
    read(["symbolic-ref", "refs/remotes/origin/HEAD"]),
  ]);

  const defaultBranch = symbolicDefault?.replace("refs/remotes/origin/", "") ?? null;

  return {
    remoteOrigin,
    currentBranch,
    defaultBranch,
    isDirty: Boolean(statusOutput && statusOutput.length > 0),
  };
}

export async function discoverRepositories(): Promise<RepositoryInventoryItem[]> {
  const roots = await listRepoRoots();

  for (const root of roots) {
    const scanResult = await scanForRepositories({
      rootPath: root.path,
      maxDepth: 4,
      includeHidden: false,
    });

    for (const repo of scanResult.repos) {
      if (!repo.hasGit) {
        continue;
      }

      const gitMetadata = await getGitMetadata(repo.path);
      await upsertRepository({
        id: `repo_${randomUUID()}`,
        rootId: root.id,
        name: repo.name,
        path: repo.path,
        remoteOrigin: gitMetadata.remoteOrigin,
        defaultBranch: gitMetadata.defaultBranch,
        currentBranch: gitMetadata.currentBranch,
        isDirty: gitMetadata.isDirty,
        fingerprintHash: null,
        profileJson: null,
        lastAnalyzedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  const repositories = await listRepositories();
  const inventory = await Promise.all(
    repositories.map(async (repository) => {
      const latestAnalysis = await getLatestAnalysisRunForRepository(repository.id);
      return serializeRepository(repository, { lastAnalysisRunId: latestAnalysis?.id ?? null });
    })
  );

  return inventory.sort((left, right) => left.name.localeCompare(right.name));
}
