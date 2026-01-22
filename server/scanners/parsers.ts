import type { ScanSignal } from "@/server/types/domain";

const KEYWORD_PRIORITY: Record<string, number> = {
  FIXME: 0.8,
  HACK: 0.6,
  XXX: 0.6,
  TODO: 0.5,
};

const GIT_STATUS_PRIORITY: Record<string, number> = {
  conflict: 0.9,
  deleted: 0.7,
  modified: 0.6,
  added: 0.4,
  untracked: 0.2,
};

/**
 * Extract TODO/FIXME/HACK/XXX comments from file content.
 * @param sessionId - Session ID to make signal IDs unique per session
 */
export function extractTodos(content: string, filePath: string, sessionId?: string): ScanSignal[] {
  if (!content) return [];

  const signals: ScanSignal[] = [];
  const lines = content.split("\n");
  const todoRegex =
    /(?:\/\/|\/\*|#|<!--)\s*(TODO|FIXME|HACK|XXX)\b[\s:]*([^\r\n]*?)(?:\*\/|-->)?$/i;
  
  // Use sessionId prefix if provided to ensure uniqueness across sessions
  const idPrefix = sessionId ? `${sessionId}_` : "";

  lines.forEach((line, idx) => {
    const match = line.match(todoRegex);
    if (match) {
      const keyword = match[1].toUpperCase();
      signals.push({
        id: `${idPrefix}todo_${filePath}_${idx}`,
        source: "local",
        signalType: "todo_comment",
        title: match[2]?.trim() || keyword,
        filePath,
        lineNumber: idx + 1,
        priority: KEYWORD_PRIORITY[keyword] ?? 0.5,
        metadata: { keyword },
      });
    }
  });

  return signals;
}

/**
 * Parse git status --porcelain output.
 * @param sessionId - Session ID to make signal IDs unique per session
 */
export function parseGitStatus(output: string, sessionId?: string): ScanSignal[] {
  if (!output) return [];

  // Use sessionId prefix if provided to ensure uniqueness across sessions
  const idPrefix = sessionId ? `${sessionId}_` : "";

  return output
    .split("\n")
    .filter((line) => line.length >= 3)
    .map((line, idx) => {
      const [staged, unstaged] = [line[0], line[1]];
      let filePath = line.slice(3);

      // Handle renames: "R  old -> new"
      const renameIdx = filePath.indexOf(" -> ");
      if (renameIdx !== -1) filePath = filePath.slice(renameIdx + 4);

      // Handle quoted paths
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1).replace(/\\(["\\])/g, "$1");
      }

      const status = getGitFileStatus(staged, unstaged);
      const isConflict = status === "conflict";

      return {
        id: `${idPrefix}git_${idx}_${filePath}`,
        source: "local" as const,
        signalType: isConflict ? "merge_conflict" : ("custom" as const),
        title: isConflict
          ? `Merge conflict: ${filePath}`
          : `Uncommitted ${status}: ${filePath}`,
        filePath,
        priority: GIT_STATUS_PRIORITY[status] ?? 0.5,
        metadata: { gitStatus: status, staged, unstaged },
      };
    });
}

function getGitFileStatus(staged: string, unstaged: string): string {
  if (staged === "?" && unstaged === "?") return "untracked";
  if (
    staged === "U" ||
    unstaged === "U" ||
    (staged === "A" && unstaged === "A") ||
    (staged === "D" && unstaged === "D")
  ) {
    return "conflict";
  }
  if (staged === "D" || unstaged === "D") return "deleted";
  if (staged === "A" || unstaged === "A") return "added";
  return "modified";
}

/**
 * Parse test runner output (jest/vitest/mocha) for failures.
 * @param sessionId - Session ID to make signal IDs unique per session
 */
export function parseTestOutput(output: string, sessionId?: string): ScanSignal[] {
  if (!output) return [];

  const signals: ScanSignal[] = [];
  const lines = output.split("\n");

  // Use sessionId prefix if provided to ensure uniqueness across sessions
  const idPrefix = sessionId ? `${sessionId}_` : "";

  let currentFile: string | undefined;
  let currentTest: string | undefined;
  let idx = 0;

  function addTestSignal() {
    signals.push({
      id: `${idPrefix}test_${idx++}_${currentFile ?? "unknown"}`,
      source: "local",
      signalType: "failing_test",
      title: currentTest
        ? `Test failing: ${currentTest}`
        : `Test failing in ${currentFile}`,
      filePath: currentFile,
      priority: 0.85,
    });
  }

  for (const line of lines) {
    // Jest/Vitest: "FAIL path/to/file.test.ts"
    const failMatch = line.match(/^\s*FAIL\s+(.+)$/);
    if (failMatch) {
      currentFile = failMatch[1].replace(/\s+\(\d+.*\)$/, "").trim();
      currentTest = undefined;
      continue;
    }

    // Jest: "● test name"
    const jestTest = line.match(/^\s*●\s+(.*)$/);
    if (jestTest) {
      currentTest = jestTest[1].trim();
      addTestSignal();
      continue;
    }

    // Vitest: "✕ test name" or "× test name"
    const vitestTest = line.match(/^\s*[✕✖×]\s+(.*)$/);
    if (vitestTest) {
      currentTest = vitestTest[1].trim();
      addTestSignal();
      continue;
    }

    // Mocha: "1) test name"
    const mochaTest = line.match(/^\s*\d+\)\s+(.*)$/);
    if (mochaTest) {
      currentTest = mochaTest[1].trim();
      addTestSignal();
    }
  }

  return signals;
}
