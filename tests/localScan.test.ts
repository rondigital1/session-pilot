import { afterEach, describe, expect, it, vi } from "vitest";

const { findFilesMock, readFilesMock, runCommandMock } = vi.hoisted(() => ({
  findFilesMock: vi.fn(),
  readFilesMock: vi.fn(),
  runCommandMock: vi.fn(),
}));

vi.mock("@/server/utils/fs", () => ({
  findFiles: findFilesMock,
  readFiles: readFilesMock,
}));

vi.mock("@/server/utils/shell", () => ({
  runCommand: runCommandMock,
}));

import { scanLocalRepository } from "@/server/scanners/localScan";

describe("scanLocalRepository", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("captures todo, git status, and recent local commit signals", async () => {
    findFilesMock.mockResolvedValue(["app/page.tsx"]);
    readFilesMock.mockResolvedValue(
      new Map([["app/page.tsx", "// TODO: tighten session scan\nexport const ready = true;\n"]])
    );
    runCommandMock
      .mockResolvedValueOnce(" M app/page.tsx\n")
      .mockResolvedValueOnce(
        "abc123def456\x1fRon\x1f2026-03-10T12:00:00.000Z\x1fFix session scan scope\x1e"
      );

    const result = await scanLocalRepository({
      workspacePath: "/tmp/session-pilot",
      sessionId: "sess_123",
    });

    expect(result.errors).toEqual([]);
    expect(result.scannedFiles).toBe(1);
    expect(runCommandMock).toHaveBeenNthCalledWith(
      1,
      "git",
      ["status", "--porcelain"],
      "/tmp/session-pilot",
      10000
    );
    expect(runCommandMock).toHaveBeenNthCalledWith(
      2,
      "git",
      [
        "log",
        "--max-count=5",
        "--date=iso-strict",
        "--pretty=format:%H%x1f%an%x1f%aI%x1f%s%x1e",
      ],
      "/tmp/session-pilot",
      10000
    );
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalType: "todo_comment",
          title: "tighten session scan",
          filePath: "app/page.tsx",
        }),
        expect.objectContaining({
          source: "local",
          signalType: "custom",
          title: "Uncommitted modified: app/page.tsx",
        }),
        expect.objectContaining({
          source: "local",
          signalType: "recent_commit",
          title: "Recent local commit: Fix session scan scope",
          metadata: expect.objectContaining({
            sha: "abc123def456",
            author: "Ron",
          }),
        }),
      ])
    );
  });
});
