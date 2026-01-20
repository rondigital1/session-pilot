import { exec as execCallback } from "child_process";
import { promisify } from "util";

const execPromise = promisify(execCallback);

/**
 * Execute a shell command and return stdout.
 * For commands that may fail but still produce useful output (like npm test),
 * the stdout is returned even on non-zero exit.
 */
export async function exec(command: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execPromise(command, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "stdout" in error) {
      return (error as { stdout: string }).stdout || "";
    }
    throw error;
  }
}
