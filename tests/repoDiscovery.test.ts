import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listRepoRootsMock,
  upsertRepositoryMock,
  listRepositoriesMock,
  getLatestAnalysisRunForRepositoryMock,
  scanForRepositoriesMock,
  runCommandMock,
} = vi.hoisted(() => ({
  listRepoRootsMock: vi.fn(),
  upsertRepositoryMock: vi.fn(),
  listRepositoriesMock: vi.fn(),
  getLatestAnalysisRunForRepositoryMock: vi.fn(),
  scanForRepositoriesMock: vi.fn(),
  runCommandMock: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  listRepoRoots: listRepoRootsMock,
  upsertRepository: upsertRepositoryMock,
  listRepositories: listRepositoriesMock,
  getLatestAnalysisRunForRepository: getLatestAnalysisRunForRepositoryMock,
}));

vi.mock("@/lib/workspace", () => ({
  scanForRepositories: scanForRepositoriesMock,
}));

vi.mock("@/server/utils/shell", () => ({
  runCommand: runCommandMock,
}));

import { discoverRepositories } from "@/server/repos/repoDiscoveryService";

describe("discoverRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listRepoRootsMock.mockResolvedValue([
      {
        id: "root_1",
        label: "Projects",
        path: "/repos",
      },
    ]);
    scanForRepositoriesMock.mockResolvedValue({
      repos: [
        {
          name: "alpha",
          path: "/repos/alpha",
          hasGit: true,
        },
        {
          name: "notes",
          path: "/repos/notes",
          hasGit: false,
        },
      ],
      scannedDirs: 2,
      errors: [],
    });
    runCommandMock.mockImplementation(async (_command: string, args: string[]) => {
      const joined = args.join(" ");
      if (joined === "config --get remote.origin.url") {
        return "git@github.com:ron/alpha.git";
      }
      if (joined === "rev-parse --abbrev-ref HEAD") {
        return "feature/refactor";
      }
      if (joined === "status --porcelain") {
        return "";
      }
      if (joined === "symbolic-ref refs/remotes/origin/HEAD") {
        return "refs/remotes/origin/main";
      }
      return "";
    });
    upsertRepositoryMock.mockResolvedValue(undefined);
    listRepositoriesMock.mockResolvedValue([
      {
        id: "repo_1",
        rootId: "root_1",
        name: "alpha",
        path: "/repos/alpha",
        remoteOrigin: "git@github.com:ron/alpha.git",
        defaultBranch: "main",
        currentBranch: "feature/refactor",
        isDirty: false,
        fingerprintHash: null,
        profileJson: null,
        lastAnalyzedAt: null,
        createdAt: new Date("2026-03-11T12:00:00.000Z"),
        updatedAt: new Date("2026-03-11T12:00:00.000Z"),
      },
    ]);
    getLatestAnalysisRunForRepositoryMock.mockResolvedValue(undefined);
  });

  it("syncs only git repositories from configured roots", async () => {
    const repositories = await discoverRepositories();

    expect(scanForRepositoriesMock).toHaveBeenCalledWith({
      rootPath: "/repos",
      maxDepth: 4,
      includeHidden: false,
    });
    expect(upsertRepositoryMock).toHaveBeenCalledTimes(1);
    expect(repositories).toHaveLength(1);
    expect(repositories[0].name).toBe("alpha");
    expect(repositories[0].defaultBranch).toBe("main");
  });
});
