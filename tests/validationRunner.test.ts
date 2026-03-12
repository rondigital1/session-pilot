import { describe, expect, it } from "vitest";
import {
  runValidationCommands,
  selectValidationCommands,
} from "@/server/execution/validationRunner";

describe("validationRunner", () => {
  it("normalizes, deduplicates, and limits validation commands", () => {
    expect(
      selectValidationCommands([
        [" npm ", "run", "lint"],
        ["npm", "run", "lint"],
        ["", "   "],
        ["npm", "run", "typecheck"],
        ["npm", "run", "test"],
        ["npm", "run", "extra"],
      ])
    ).toEqual([
      ["npm", "run", "lint"],
      ["npm", "run", "typecheck"],
      ["npm", "run", "test"],
    ]);
  });

  it("maps timed out validation commands to a non-zero result", async () => {
    const [result] = await runValidationCommands(process.cwd(), [
      [process.execPath, "-e", "setTimeout(() => {}, 500);"],
    ], {
      timeoutMs: 50,
    });

    expect(result.command).toEqual([process.execPath, "-e", "setTimeout(() => {}, 500);"]);
    expect(result.exitCode).toBe(124);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("aborts before starting validation when the signal is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Stop now"));

    await expect(
      runValidationCommands(
        process.cwd(),
        [[process.execPath, "-e", "console.log('ok')"]],
        {
          signal: controller.signal,
        }
      )
    ).rejects.toThrow("Stop now");
  });
});
