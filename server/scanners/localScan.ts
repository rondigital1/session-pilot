import type { ScanSignal } from "@/server/types/domain";
import { exec } from "@/server/utils/shell";
import { findFiles, readFiles } from "@/server/utils/fs";
import { extractTodos, parseGitStatus, parseTestOutput } from "./parsers";

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const DEFAULT_IGNORE = ["node_modules/**", ".git/**", "dist/**", "build/**"];

export interface LocalScanOptions {
  workspacePath: string;
  sessionId: string;
  includeTests?: boolean;
  excludePatterns?: string[];
}

export interface LocalScanResult {
  signals: ScanSignal[];
  scannedFiles: number;
  errors: string[];
}

/**
 * Scan a local repository for signals (TODOs, git changes, test failures).
 */
export async function scanLocalRepository(
  options: LocalScanOptions
): Promise<LocalScanResult> {
  const { workspacePath, includeTests, excludePatterns = [] } = options;
  const signals: ScanSignal[] = [];
  const errors: string[] = [];

  try {
    // Find and read source files
    const files = await findFiles({
      cwd: workspacePath,
      extensions: DEFAULT_EXTENSIONS,
      ignore: [...DEFAULT_IGNORE, ...excludePatterns],
    });

    const contents = await readFiles(workspacePath, files);

    // Extract TODOs from each file
    for (const [filePath, content] of contents) {
      signals.push(...extractTodos(content, filePath));
    }

    // Get git status
    const gitOutput = await exec("git status --porcelain", workspacePath);
    signals.push(...parseGitStatus(gitOutput));

    // Optionally run tests
    if (includeTests) {
      const testOutput = await exec("npm test", workspacePath);
      signals.push(...parseTestOutput(testOutput));
    }

    return { signals, scannedFiles: contents.size, errors };
  } catch (error) {
    errors.push(`Scan error: ${error}`);
    return { signals, scannedFiles: 0, errors };
  }
}

// Re-export parsers for direct use if needed
export { extractTodos, parseGitStatus, parseTestOutput } from "./parsers";
