import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeDiagnostics } from "@/server/config/runtime";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("getRuntimeDiagnostics", () => {
  it("reports optional feature warnings in development", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.SESSIONPILOT_WORKSPACE_ROOTS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    Object.assign(process.env, { NODE_ENV: "development" });

    const diagnostics = await getRuntimeDiagnostics();

    expect(diagnostics.status).toBe("degraded");
    expect(diagnostics.checks.anthropic.status).toBe("warning");
    expect(diagnostics.checks.github.status).toBe("warning");
    expect(diagnostics.checks.workspaceRoots.status).toBe("warning");
  });

  it("reports blocking config errors for invalid production settings", async () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "not-a-url",
      SESSIONPILOT_WORKSPACE_ROOTS: "/definitely/missing/root",
    });

    const diagnostics = await getRuntimeDiagnostics();

    expect(diagnostics.status).toBe("degraded");
    expect(diagnostics.checks.appUrl.status).toBe("error");
    expect(diagnostics.checks.workspaceRoots.status).toBe("error");
  });
});
