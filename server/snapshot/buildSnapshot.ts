/**
 * Project Snapshot Builder
 *
 * Scans a workspace and builds a deterministic ProjectSnapshotV1.
 * The snapshot captures health signals, hotspots, and stack info
 * that drive improvement idea generation.
 *
 * Determinism: paths are normalized to posix, arrays are sorted by
 * stable keys, and the snapshot hash is a SHA-256 of the canonical JSON.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import { runCommand } from "@/server/utils/shell";
import { findFiles } from "@/server/utils/fs";
import type {
  ProjectSnapshotV1,
  SnapshotSignal,
  RepoInfo,
  Health,
  Hotspots,
  LargeFile,
  TodoHotspot,
} from "./schema";

// =============================================================================
// Types
// =============================================================================

export interface BuildSnapshotOptions {
  workspaceId: string;
  localPath: string;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// =============================================================================
// Path Normalization
// =============================================================================

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

// =============================================================================
// Git Info
// =============================================================================

async function getRepoInfo(repoRoot: string): Promise<RepoInfo> {
  let lastCommitHash: string | null = null;
  let lastCommitMessage: string | null = null;
  let isDirty = false;
  let defaultBranch: string | null = null;

  try {
    const hashOut = await runCommand(
      "git", ["log", "-1", "--format=%H"], repoRoot, 5000
    );
    lastCommitHash = hashOut.trim() || null;
  } catch {
    // not a git repo or no commits
  }

  try {
    const msgOut = await runCommand(
      "git", ["log", "-1", "--format=%s"], repoRoot, 5000
    );
    lastCommitMessage = msgOut.trim() || null;
  } catch {
    // ignore
  }

  try {
    const statusOut = await runCommand(
      "git", ["status", "--porcelain"], repoRoot, 5000
    );
    isDirty = statusOut.trim().length > 0;
  } catch {
    // ignore
  }

  try {
    const branchOut = await runCommand(
      "git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot, 5000
    );
    defaultBranch = branchOut.trim() || null;
  } catch {
    // ignore
  }

  return {
    root: toPosix(repoRoot),
    lastCommitHash,
    lastCommitMessage,
    isDirty,
    defaultBranch,
  };
}

// =============================================================================
// Package.json Reading
// =============================================================================

async function readPackageJson(repoRoot: string): Promise<PackageJson | null> {
  try {
    const content = await fs.readFile(
      path.join(repoRoot, "package.json"), "utf-8"
    );
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

// =============================================================================
// Health Detection
// =============================================================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectHealth(
  repoRoot: string,
  pkg: PackageJson | null
): Promise<Health> {
  const allDeps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  const scripts = pkg?.scripts ?? {};

  // Test detection
  const testRunners = ["jest", "vitest", "mocha", "ava", "@playwright/test", "cypress"];
  const testRunner = testRunners.find((r) => r in allDeps) ?? null;
  const hasTestScript = "test" in scripts;
  const hasTestDir = await fileExists(path.join(repoRoot, "__tests__"))
    || await fileExists(path.join(repoRoot, "tests"))
    || await fileExists(path.join(repoRoot, "test"));
  const hasTests = testRunner !== null || hasTestScript || hasTestDir;

  // Lint detection
  const lintTools = ["eslint", "biome", "@biomejs/biome", "oxlint", "tslint"];
  const lintTool = lintTools.find((r) => r in allDeps) ?? null;
  const hasLint = lintTool !== null || "lint" in scripts;

  // TypeScript detection
  const tsconfigPath = path.join(repoRoot, "tsconfig.json");
  const hasTypecheck = await fileExists(tsconfigPath);
  let typecheckStrict = false;
  if (hasTypecheck) {
    try {
      const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, "utf-8"));
      typecheckStrict = tsconfig?.compilerOptions?.strict === true;
    } catch {
      // ignore
    }
  }

  // CI detection
  const ciChecks: Array<{ path: string; provider: string }> = [
    { path: ".github/workflows", provider: "github_actions" },
    { path: ".circleci", provider: "circleci" },
    { path: ".gitlab-ci.yml", provider: "gitlab_ci" },
    { path: "Jenkinsfile", provider: "jenkins" },
    { path: ".travis.yml", provider: "travis" },
  ];

  let hasCi = false;
  let ciProvider: string | null = null;
  for (const check of ciChecks) {
    if (await fileExists(path.join(repoRoot, check.path))) {
      hasCi = true;
      ciProvider = check.provider;
      break;
    }
  }

  // Docs detection
  const hasReadme = await fileExists(path.join(repoRoot, "README.md"))
    || await fileExists(path.join(repoRoot, "readme.md"))
    || await fileExists(path.join(repoRoot, "Readme.md"));
  const hasEnvExample = await fileExists(path.join(repoRoot, ".env.example"))
    || await fileExists(path.join(repoRoot, ".env.sample"));

  return {
    hasTests,
    testRunner,
    hasLint,
    lintTool,
    hasTypecheck,
    typecheckStrict,
    hasCi,
    ciProvider,
    hasReadme,
    hasEnvExample,
  };
}

// =============================================================================
// Stack Tags
// =============================================================================

function inferStackTags(pkg: PackageJson | null): string[] {
  if (!pkg) {
    return [];
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const tags: string[] = [];

  const tagMap: Record<string, string> = {
    next: "nextjs",
    react: "react",
    "react-dom": "react",
    vue: "vue",
    svelte: "svelte",
    express: "express",
    fastify: "fastify",
    hono: "hono",
    tailwindcss: "tailwind",
    prisma: "prisma",
    "drizzle-orm": "drizzle",
    mongoose: "mongoose",
    typeorm: "typeorm",
    "socket.io": "websockets",
    graphql: "graphql",
    trpc: "trpc",
    "@trpc/server": "trpc",
    zod: "zod",
    typescript: "typescript",
  };

  for (const [dep, tag] of Object.entries(tagMap)) {
    if (dep in allDeps && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags.sort();
}

// =============================================================================
// Hotspots
// =============================================================================

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
const IGNORE_PATTERNS = ["node_modules/**", ".git/**", "dist/**", "build/**", ".next/**"];

async function detectHotspots(repoRoot: string): Promise<Hotspots> {
  const files = await findFiles({
    cwd: repoRoot,
    extensions: SOURCE_EXTENSIONS,
    ignore: IGNORE_PATTERNS,
  });

  // Count lines for each file
  const fileSizes: LargeFile[] = [];
  const todoCounts: Map<string, number> = new Map();
  const todoRegex = /\b(TODO|FIXME|HACK|XXX)\b/gi;

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(repoRoot, file), "utf-8");
      const lines = content.split("\n").length;
      fileSizes.push({ path: toPosix(file), lines });

      const matches = content.match(todoRegex);
      if (matches && matches.length > 0) {
        todoCounts.set(toPosix(file), matches.length);
      }
    } catch {
      // skip unreadable files
    }
  }

  // Sort largest files descending, take top 10
  const largestFiles = fileSizes
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10);

  // Sort todo hotspots descending by count, take top 10
  const todoHotspots: TodoHotspot[] = Array.from(todoCounts.entries())
    .map(([filePath, count]) => ({ path: filePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { largestFiles, todoHotspots };
}

// =============================================================================
// Signals
// =============================================================================

function buildSignals(health: Health, hotspots: Hotspots): SnapshotSignal[] {
  const signals: SnapshotSignal[] = [];

  if (!health.hasTests) {
    signals.push({
      key: "tests.missing",
      category: "tests",
      severity: "critical",
      title: "No test framework detected",
      evidence: "No test runner found in dependencies and no test directory present",
    });
  }

  if (!health.hasCi) {
    signals.push({
      key: "ci.missing",
      category: "ci",
      severity: "warning",
      title: "No CI/CD pipeline detected",
      evidence: "No CI config files found (.github/workflows, .circleci, etc.)",
    });
  }

  if (!health.hasReadme) {
    signals.push({
      key: "docs.readme_missing",
      category: "docs",
      severity: "warning",
      title: "No README file found",
      evidence: "No README.md found in project root",
    });
  }

  if (!health.hasEnvExample) {
    signals.push({
      key: "docs.env_missing",
      category: "docs",
      severity: "info",
      title: "No .env.example file",
      evidence: "No .env.example or .env.sample found for environment documentation",
    });
  }

  if (health.hasTypecheck && !health.typecheckStrict) {
    signals.push({
      key: "types.not_strict",
      category: "types",
      severity: "warning",
      title: "TypeScript strict mode is disabled",
      evidence: "tsconfig.json has strict: false or strict not set",
    });
  }

  if (!health.hasLint) {
    signals.push({
      key: "lint.missing",
      category: "lint",
      severity: "warning",
      title: "No linter configured",
      evidence: "No lint tool found in dependencies (eslint, biome, etc.)",
    });
  }

  // Large file hotspots (files > 400 lines)
  const largeThreshold = 400;
  for (const file of hotspots.largestFiles) {
    if (file.lines > largeThreshold) {
      signals.push({
        key: `hotspot.large_file.${file.path}`,
        category: "hotspot",
        severity: "info",
        title: `Large file: ${file.path} (${file.lines} lines)`,
        detail: `Consider splitting into smaller modules`,
        evidence: `${file.path} has ${file.lines} lines, exceeding ${largeThreshold} line threshold`,
        filePath: file.path,
      });
    }
  }

  // Todo hotspots (files with >= 3 TODOs)
  const todoThreshold = 3;
  for (const hotspot of hotspots.todoHotspots) {
    if (hotspot.count >= todoThreshold) {
      signals.push({
        key: `todo.hotspot.${hotspot.path}`,
        category: "todo",
        severity: "info",
        title: `TODO hotspot: ${hotspot.path} (${hotspot.count} markers)`,
        detail: `File has accumulated ${hotspot.count} TODO/FIXME markers`,
        evidence: `${hotspot.path} contains ${hotspot.count} TODO/FIXME/HACK/XXX markers`,
        filePath: hotspot.path,
      });
    }
  }

  // Sort signals by key for determinism
  return signals.sort((a, b) => a.key.localeCompare(b.key));
}

// =============================================================================
// Canonical JSON + Hash
// =============================================================================

function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}

function computeSnapshotHash(snapshot: Omit<ProjectSnapshotV1, "snapshotHash" | "createdAt">): string {
  const canonical = canonicalJson(snapshot);
  return createHash("sha256").update(canonical).digest("hex");
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build a deterministic project snapshot from a workspace path.
 *
 * The snapshot captures repo info, health signals, hotspots, and stack tags.
 * Identical repo state produces an identical snapshotHash.
 */
export async function buildProjectSnapshot(
  options: BuildSnapshotOptions
): Promise<ProjectSnapshotV1> {
  const { workspaceId, localPath } = options;

  // Validate the path exists
  const stats = await fs.stat(localPath);
  if (!stats.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${localPath}`);
  }

  // Gather data in parallel where possible
  const [repo, pkg] = await Promise.all([
    getRepoInfo(localPath),
    readPackageJson(localPath),
  ]);

  const [health, hotspots] = await Promise.all([
    detectHealth(localPath, pkg),
    detectHotspots(localPath),
  ]);

  const stackTags = inferStackTags(pkg);
  const signals = buildSignals(health, hotspots);

  // Build snapshot without hash first, then compute hash
  const snapshotWithoutHash = {
    version: 1 as const,
    workspaceId,
    repo,
    health,
    hotspots,
    stackTags,
    signals,
  };

  const snapshotHash = computeSnapshotHash(snapshotWithoutHash);

  const snapshot: ProjectSnapshotV1 = {
    ...snapshotWithoutHash,
    createdAt: new Date().toISOString(),
    snapshotHash,
  };

  return snapshot;
}
