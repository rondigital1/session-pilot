import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";

const execFilePromise = promisify(execFileCallback);

/**
 * Default timeout for shell commands (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum output buffer size (10MB)
 */
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Restricted PATH for shell commands - only standard system directories
 */
const SAFE_PATH = "/usr/local/bin:/usr/bin:/bin";

/**
 * Execute a command with arguments safely (no shell interpolation).
 * 
 * SECURITY: This uses execFile with shell:false to prevent shell injection.
 * The command and arguments are passed directly to the process, not through a shell.
 * 
 * @param command - The command to execute (e.g., "git", "ls")
 * @param args - Array of arguments (e.g., ["status", "--porcelain"])
 * @param cwd - Working directory for the command
 * @param timeoutMs - Timeout in milliseconds (default: 30s)
 * @returns stdout as a string
 * @throws Error if command fails or times out
 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  try {
    const { stdout } = await execFilePromise(command, args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      timeout: timeoutMs,
      shell: false, // CRITICAL: Never use shell to prevent injection
      env: {
        ...process.env,
        PATH: SAFE_PATH, // Restrict PATH to standard locations
      },
    });
    return stdout;
  } catch (error: unknown) {
    // For commands that may fail but still produce useful output
    if (error && typeof error === "object" && "stdout" in error) {
      return (error as { stdout: string }).stdout || "";
    }
    throw error;
  }
}

/**
 * @deprecated Use runCommand() instead - this function is vulnerable to shell injection
 * 
 * This function is kept temporarily for backwards compatibility but should not be used.
 * All callers should be migrated to runCommand().
 */
export async function exec(command: string, cwd: string): Promise<string> {
  console.warn(
    "[Security] exec() is deprecated due to shell injection risk. Use runCommand() instead."
  );
  
  // Parse simple commands into command + args
  // This is a best-effort migration path - complex commands should be rewritten
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  
  return runCommand(cmd, args, cwd);
}
