import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runCommandMock } = vi.hoisted(() => ({
  runCommandMock: vi.fn(),
}));

vi.mock("@/server/utils/shell", () => ({
  runCommand: runCommandMock,
}));

import { fingerprintRepository } from "@/server/repos/repoFingerprintService";

const tempDirs: string[] = [];

async function createTempRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "session-pilot-repo-"));
  tempDirs.push(repoPath);
  return repoPath;
}

describe("fingerprintRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCommandMock.mockImplementation(async (_command: string, args: string[]) => {
      const joined = args.join(" ");

      if (joined === "config --get remote.origin.url") {
        return "git@github.com:ron/example.git";
      }

      if (joined === "rev-parse --abbrev-ref HEAD") {
        return "main";
      }

      if (joined === "status --porcelain") {
        return "";
      }

      if (joined === "symbolic-ref refs/remotes/origin/HEAD") {
        return "refs/remotes/origin/main";
      }

      if (joined === "rev-parse HEAD") {
        return "abc123";
      }

      return "";
    });
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("collects entry, env, test, CI, and lint evidence for downstream analysis", async () => {
    const repoPath = await createTempRepo();

    await fs.mkdir(path.join(repoPath, "app"), { recursive: true });
    await fs.mkdir(path.join(repoPath, "tests"), { recursive: true });
    await fs.mkdir(path.join(repoPath, ".github", "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify(
        {
          scripts: {
            test: "vitest run",
            lint: "eslint .",
          },
          dependencies: {
            next: "^15.0.0",
            react: "^19.0.0",
          },
          devDependencies: {
            vitest: "^4.0.0",
          },
        },
        null,
        2
      )
    );
    await fs.writeFile(
      path.join(repoPath, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: false } }, null, 2)
    );
    await fs.writeFile(path.join(repoPath, "README.md"), "# Example\n");
    await fs.writeFile(path.join(repoPath, ".env"), "API_URL=https://example.com\n");
    await fs.writeFile(
      path.join(repoPath, "app", "page.tsx"),
      "export default function Page() { return <div>{process.env.API_URL}</div>; }\n"
    );
    await fs.writeFile(path.join(repoPath, "tests", "app.test.ts"), "it('works', () => {});\n");
    await fs.writeFile(path.join(repoPath, ".github", "workflows", "ci.yml"), "name: ci\n");
    await fs.writeFile(path.join(repoPath, "eslint.config.js"), "export default [];\n");

    const result = await fingerprintRepository("repo_1", repoPath);

    expect(result.profile.hasTests).toBe(true);
    expect(result.profile.hasCi).toBe(true);
    expect(result.profile.hasLint).toBe(true);
    expect(result.entryFiles).toEqual(["app/page.tsx"]);
    expect(result.envUsageFiles).toEqual(["app/page.tsx"]);
    expect(result.testFiles).toEqual(["tests/app.test.ts"]);
    expect(result.ciFiles).toEqual([".github/workflows/ci.yml"]);
    expect(result.lintConfigFiles).toEqual(["eslint.config.js"]);
    expect(result.typecheckConfigFiles).toEqual(["tsconfig.json"]);
    expect(result.manifestFiles).toEqual(["package.json"]);
  });

  it("does not treat an empty workflows directory as configured CI", async () => {
    const repoPath = await createTempRepo();

    await fs.mkdir(path.join(repoPath, ".github", "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify(
        {
          scripts: {
            lint: "npm run lint",
          },
        },
        null,
        2
      )
    );
    await fs.writeFile(path.join(repoPath, "src.ts"), "export const value = 1;\n");

    const result = await fingerprintRepository("repo_2", repoPath);

    expect(result.ciFiles).toEqual([]);
    expect(result.profile.hasCi).toBe(false);
  });
});
