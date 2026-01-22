import type { ScanSignal } from "@/server/types/domain";
import { runCommand } from "@/server/utils/shell";
import { findFiles, readFiles } from "@/server/utils/fs";
import { extractTodos, parseGitStatus } from "./parsers";

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const DEFAULT_IGNORE = ["node_modules/**", ".git/**", "dist/**", "build/**"];

export interface LocalScanOptions {
  workspacePath: string;
  sessionId: string;
  excludePatterns?: string[];
}

export interface LocalScanResult {
  signals: ScanSignal[];
  scannedFiles: number;
  errors: string[];
}

/**
 * Scan a local repository for signals (TODOs, git changes).
 * 
 * SECURITY NOTES:
 * - Uses runCommand() with args array to prevent shell injection
 * - Test execution has been removed as it runs untrusted code
 * - File reading is restricted to source files with known extensions
 */
export async function scanLocalRepository(
  options: LocalScanOptions
): Promise<LocalScanResult> {
  const { workspacePath, sessionId, excludePatterns = [] } = options;
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

    // Extract TODOs from each file (pass sessionId for unique IDs)
    for (const [filePath, content] of contents) {
      signals.push(...extractTodos(content, filePath, sessionId));
    }

    // Get git status using safe command execution
    // SECURITY: Using runCommand with args array prevents shell injection
    try {
      const gitOutput = await runCommand(
        "git",
        ["status", "--porcelain"],
        workspacePath,
        10000 // 10 second timeout for git status
      );
      signals.push(...parseGitStatus(gitOutput, sessionId));
    } catch (gitError) {
      // Git may not be available or directory may not be a repo
      errors.push(`Git status failed: ${gitError}`);
    }

    // NOTE: Test execution has been removed for security reasons.
    // Running `npm test` would execute arbitrary code from the repository,
    // which is a significant security risk for untrusted codebases.

    return { signals, scannedFiles: contents.size, errors };
  } catch (error) {
    errors.push(`Scan error: ${error}`);
    return { signals, scannedFiles: 0, errors };
  }
}

// Re-export parsers for direct use if needed
export { extractTodos, parseGitStatus } from "./parsers";
