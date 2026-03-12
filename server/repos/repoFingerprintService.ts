import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import { findFiles } from "@/server/utils/fs";
import { stableStringify } from "@/server/utils/stableJson";
import { runCommand } from "@/server/utils/shell";
import type { RepoProfile } from "@/server/types/domain";

export interface RepoLargeFile {
  path: string;
  lines: number;
}

export interface RepoTodoHotspot {
  path: string;
  count: number;
}

export interface RepositoryInspectionResult {
  profile: RepoProfile;
  fingerprintHash: string;
  largestFiles: RepoLargeFile[];
  todoHotspots: RepoTodoHotspot[];
  manifestFiles: string[];
  readmeFiles: string[];
  envExampleFiles: string[];
  envLocalFiles: string[];
  ciFiles: string[];
  lintConfigFiles: string[];
  typecheckConfigFiles: string[];
  testFiles: string[];
  entryFiles: string[];
  envUsageFiles: string[];
}

interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".py",
  ".go",
  ".rs",
];
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"];
const IGNORE_PATTERNS = [
  "node_modules/**",
  ".git/**",
  ".next/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".turbo/**",
];
const WORKFLOW_EXTENSIONS = [".yml", ".yaml"];
const README_CANDIDATES = ["README.md", "README.mdx"];
const ENV_EXAMPLE_CANDIDATES = [".env.example", ".env.sample"];
const ENV_LOCAL_CANDIDATES = [".env", ".env.local"];
const LINT_CONFIG_CANDIDATES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  "biome.json",
  "biome.jsonc",
];
const TYPECHECK_CONFIG_CANDIDATES = ["tsconfig.json", "tsconfig.base.json"];
const ENTRY_FILE_CANDIDATES = [
  "app/page.tsx",
  "app/page.jsx",
  "app/layout.tsx",
  "app/layout.jsx",
  "pages/index.tsx",
  "pages/index.jsx",
  "pages/api/index.ts",
  "pages/api/index.js",
  "src/main.ts",
  "src/main.tsx",
  "src/index.ts",
  "src/index.tsx",
  "src/App.tsx",
  "src/App.jsx",
  "server.ts",
  "server.js",
  "main.py",
  "main.go",
];
const ENV_USAGE_PATTERNS = [
  /process\.env\b/i,
  /import\.meta\.env\b/i,
  /os\.getenv\(/i,
  /os\.environ\[/i,
  /os\.Getenv\(/i,
];

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(repoPath: string): Promise<PackageJsonShape | null> {
  try {
    const raw = await fs.readFile(path.join(repoPath, "package.json"), "utf-8");
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return null;
  }
}

async function collectExistingFiles(repoPath: string, candidatePaths: string[]): Promise<string[]> {
  const matches = await Promise.all(
    candidatePaths.map(async (candidatePath) => ({
      candidatePath,
      exists: await pathExists(path.join(repoPath, candidatePath)),
    }))
  );

  return matches
    .filter((match) => match.exists)
    .map((match) => toPosix(match.candidatePath))
    .sort();
}

function detectPackageManager(repoPath: string): RepoProfile["packageManager"] {
  const lockfiles: Array<{ fileName: string; manager: RepoProfile["packageManager"] }> = [
    { fileName: "pnpm-lock.yaml", manager: "pnpm" },
    { fileName: "yarn.lock", manager: "yarn" },
    { fileName: "bun.lockb", manager: "bun" },
    { fileName: "bun.lock", manager: "bun" },
    { fileName: "package-lock.json", manager: "npm" },
  ];

  for (const lockfile of lockfiles) {
    const lockfilePath = path.join(repoPath, lockfile.fileName);
    if (existsSync(lockfilePath)) {
      return lockfile.manager;
    }
  }

  return "unknown";
}

async function collectCiFiles(repoPath: string): Promise<string[]> {
  const workflowDir = path.join(repoPath, ".github", "workflows");
  const workflowFiles = (await pathExists(workflowDir))
    ? await findFiles({
        cwd: workflowDir,
        extensions: WORKFLOW_EXTENSIONS,
      })
    : [];
  const normalizedWorkflowFiles = workflowFiles
    .map((file) => toPosix(path.join(".github", "workflows", file)))
    .sort();
  const explicitCiFiles = await collectExistingFiles(repoPath, [
    ".circleci/config.yml",
    ".circleci/config.yaml",
    ".gitlab-ci.yml",
  ]);

  return Array.from(new Set([...normalizedWorkflowFiles, ...explicitCiFiles])).sort();
}

function buildScriptCommand(
  packageManager: RepoProfile["packageManager"],
  scriptName: string
): string[] {
  if (packageManager === "pnpm") {
    return ["pnpm", "run", scriptName];
  }

  if (packageManager === "yarn") {
    return ["yarn", scriptName];
  }

  if (packageManager === "bun") {
    return ["bun", "run", scriptName];
  }

  if (packageManager === "npm") {
    return ["npm", "run", scriptName];
  }

  return [];
}

function inferFrameworks(pkg: PackageJsonShape | null): string[] {
  const deps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  const frameworks: string[] = [];

  const pairs: Array<[string, string]> = [
    ["next", "nextjs"],
    ["react", "react"],
    ["vue", "vue"],
    ["svelte", "svelte"],
    ["express", "express"],
    ["fastify", "fastify"],
    ["tailwindcss", "tailwind"],
    ["drizzle-orm", "drizzle"],
    ["@tanstack/react-query", "tanstack-query"],
    ["vitest", "vitest"],
    ["jest", "jest"],
    ["playwright", "playwright"],
  ];

  for (const [dep, label] of pairs) {
    if (deps[dep] && !frameworks.includes(label)) {
      frameworks.push(label);
    }
  }

  return frameworks.sort();
}

function inferLanguages(files: string[]): string[] {
  const languageSet = new Set<string>();
  const extensionMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
  };

  for (const file of files) {
    const extension = path.extname(file);
    const language = extensionMap[extension];

    if (language) {
      languageSet.add(language);
    }
  }

  return Array.from(languageSet).sort();
}

function isTestFile(filePath: string): boolean {
  return /(^|\/)(__tests__|tests)\//.test(filePath) || /\.(test|spec)\.[^/.]+$/i.test(filePath);
}

function detectEntryFiles(sourceFiles: string[], testFiles: string[], largestFiles: RepoLargeFile[]): string[] {
  const sourceSet = new Set(sourceFiles);
  const testFileSet = new Set(testFiles);
  const prioritizedEntries = ENTRY_FILE_CANDIDATES.filter(
    (candidate) => sourceSet.has(candidate) && !testFileSet.has(candidate)
  );

  if (prioritizedEntries.length > 0) {
    return prioritizedEntries.slice(0, 3);
  }

  const patternEntries = sourceFiles.filter((file) => {
    if (testFileSet.has(file)) {
      return false;
    }

    return (
      /(^|\/)(app\/.*page|pages\/index|pages\/api\/.*|src\/main|src\/index|src\/App)\.[^/]+$/i.test(
        file
      ) || /(^|\/)(server|main)\.[^/]+$/i.test(file)
    );
  });

  if (patternEntries.length > 0) {
    return patternEntries.sort().slice(0, 3);
  }

  return largestFiles
    .map((file) => file.path)
    .filter((file) => !testFileSet.has(file) && CODE_EXTENSIONS.includes(path.extname(file)))
    .slice(0, 3);
}

async function getGitOutput(
  repoPath: string,
  args: string[]
): Promise<string | null> {
  try {
    const output = await runCommand("git", args, repoPath, 15000);
    return output.trim() || null;
  } catch {
    return null;
  }
}

async function getGitState(repoPath: string) {
  const [remoteOrigin, currentBranch, statusOutput, symbolicDefault, headSha] = await Promise.all([
    getGitOutput(repoPath, ["config", "--get", "remote.origin.url"]),
    getGitOutput(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
    getGitOutput(repoPath, ["status", "--porcelain"]),
    getGitOutput(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]),
    getGitOutput(repoPath, ["rev-parse", "HEAD"]),
  ]);

  let defaultBranch = symbolicDefault;
  if (defaultBranch?.startsWith("refs/remotes/origin/")) {
    defaultBranch = defaultBranch.replace("refs/remotes/origin/", "");
  }

  return {
    remoteOrigin,
    currentBranch,
    defaultBranch,
    headSha,
    isDirty: Boolean(statusOutput && statusOutput.length > 0),
  };
}

async function detectTypeScriptStrict(repoPath: string): Promise<boolean> {
  for (const configFile of TYPECHECK_CONFIG_CANDIDATES) {
    const tsconfigPath = path.join(repoPath, configFile);
    if (!(await pathExists(tsconfigPath))) {
      continue;
    }

    try {
      const raw = await fs.readFile(tsconfigPath, "utf-8");
      const parsed = JSON.parse(raw) as { compilerOptions?: { strict?: boolean } };
      if (parsed.compilerOptions?.strict === true) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export async function fingerprintRepository(
  repositoryId: string,
  repoPath: string
): Promise<RepositoryInspectionResult> {
  const pkg = await readPackageJson(repoPath);
  const manifestFiles = pkg ? ["package.json"] : [];
  const packageManager = detectPackageManager(repoPath);
  const sourceFiles = await findFiles({
    cwd: repoPath,
    extensions: SOURCE_EXTENSIONS,
    ignore: IGNORE_PATTERNS,
  });

  const gitState = await getGitState(repoPath);
  const largestFiles: RepoLargeFile[] = [];
  const todoHotspots: RepoTodoHotspot[] = [];
  const envUsageFiles = new Set<string>();
  let lineCount = 0;
  const todoRegex = /\b(TODO|FIXME|HACK|XXX)\b/gi;

  for (const file of sourceFiles) {
    const fullPath = path.join(repoPath, file);

    try {
      // eslint-disable-next-line no-await-in-loop
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n").length;
      lineCount += lines;
      largestFiles.push({ path: toPosix(file), lines });

      const matches = content.match(todoRegex);
      if (matches && matches.length > 0) {
        todoHotspots.push({ path: toPosix(file), count: matches.length });
      }

      if (ENV_USAGE_PATTERNS.some((pattern) => pattern.test(content))) {
        envUsageFiles.add(toPosix(file));
      }
    } catch {
      continue;
    }
  }

  largestFiles.sort((left, right) => right.lines - left.lines);
  todoHotspots.sort((left, right) => right.count - left.count);

  const readmeFiles = await collectExistingFiles(repoPath, README_CANDIDATES);
  const envExampleFiles = await collectExistingFiles(repoPath, ENV_EXAMPLE_CANDIDATES);
  const envLocalFiles = await collectExistingFiles(repoPath, ENV_LOCAL_CANDIDATES);
  const ciFiles = await collectCiFiles(repoPath);
  const lintConfigFiles = await collectExistingFiles(repoPath, LINT_CONFIG_CANDIDATES);
  const typecheckConfigFiles = await collectExistingFiles(repoPath, TYPECHECK_CONFIG_CANDIDATES);
  const testFiles = sourceFiles.filter(isTestFile).sort();
  const entryFiles = detectEntryFiles(sourceFiles, testFiles, largestFiles);
  const hasReadme = readmeFiles.length > 0;
  const hasEnvExample = envExampleFiles.length > 0;
  const hasCi = ciFiles.length > 0;
  const hasTypecheck = typecheckConfigFiles.length > 0;
  const typecheckStrict = await detectTypeScriptStrict(repoPath);
  const frameworks = inferFrameworks(pkg);
  const scripts = Object.keys(pkg?.scripts ?? {}).sort();
  const scriptSet = new Set(scripts);
  const dependencies = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  const hasLint =
    scriptSet.has("lint") ||
    lintConfigFiles.length > 0 ||
    Boolean(dependencies.eslint || dependencies["@biomejs/biome"]);
  const hasTests =
    scriptSet.has("test") ||
    testFiles.length > 0 ||
    Boolean(dependencies.vitest || dependencies.jest || dependencies["@playwright/test"]);

  const validationCommands: string[][] = [];

  if (scriptSet.has("lint")) {
    validationCommands.push(buildScriptCommand(packageManager, "lint"));
  }

  if (scriptSet.has("typecheck")) {
    validationCommands.push(buildScriptCommand(packageManager, "typecheck"));
  } else if (scriptSet.has("check")) {
    validationCommands.push(buildScriptCommand(packageManager, "check"));
  }

  if (scriptSet.has("test")) {
    validationCommands.push(buildScriptCommand(packageManager, "test"));
  }

  const filteredValidationCommands = validationCommands.filter((command) => command.length > 0);

  const profile: RepoProfile = {
    repositoryId,
    repoName: path.basename(repoPath),
    repoPath,
    packageManager,
    languages: inferLanguages(sourceFiles),
    frameworks,
    scripts,
    stackTags: Array.from(new Set([...frameworks, ...inferLanguages(sourceFiles)])).sort(),
    validationCommands: filteredValidationCommands,
    defaultBranch: gitState.defaultBranch,
    currentBranch: gitState.currentBranch,
    remoteOrigin: gitState.remoteOrigin,
    isDirty: gitState.isDirty,
    hasReadme,
    hasEnvExample,
    hasCi,
    hasLint,
    hasTests,
    hasTypecheck,
    typecheckStrict,
    ciProvider: hasCi ? "detected" : null,
    testRunner: dependencies.vitest
      ? "vitest"
      : dependencies.jest
      ? "jest"
      : dependencies["@playwright/test"]
      ? "playwright"
      : null,
    lintTool: dependencies.eslint
      ? "eslint"
      : dependencies["@biomejs/biome"]
      ? "biome"
      : null,
    lineCount,
    fileCount: sourceFiles.filter((file) => CODE_EXTENSIONS.includes(path.extname(file))).length,
  };

  const fingerprintHash = createHash("sha256")
    .update(
      stableStringify({
        profile,
        largestFiles: largestFiles.slice(0, 10),
        todoHotspots: todoHotspots.slice(0, 10),
        entryFiles,
        testFiles: testFiles.slice(0, 10),
        envUsageFiles: Array.from(envUsageFiles).sort().slice(0, 10),
        ciFiles,
        lintConfigFiles,
        headSha: gitState.headSha,
      })
    )
    .digest("hex");

  return {
    profile,
    fingerprintHash,
    largestFiles: largestFiles.slice(0, 10),
    todoHotspots: todoHotspots.slice(0, 10),
    manifestFiles,
    readmeFiles,
    envExampleFiles,
    envLocalFiles,
    ciFiles,
    lintConfigFiles,
    typecheckConfigFiles,
    testFiles: testFiles.slice(0, 10),
    entryFiles,
    envUsageFiles: Array.from(envUsageFiles).sort().slice(0, 10),
  };
}
