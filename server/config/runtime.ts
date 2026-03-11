import * as fs from "fs/promises";
import { z } from "zod";

type CheckStatus = "ok" | "warning" | "error";

export interface RuntimeCheck {
  status: CheckStatus;
  message: string;
}

export interface RuntimeDiagnostics {
  status: "ok" | "degraded";
  warnings: string[];
  checks: {
    appUrl: RuntimeCheck;
    anthropic: RuntimeCheck;
    github: RuntimeCheck;
    workspaceRoots: RuntimeCheck;
  };
  config: {
    appUrl?: string;
    dbPath: string;
    workspaceRoots: string[];
    hasAnthropic: boolean;
    hasGithubToken: boolean;
  };
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    NEXT_PUBLIC_APP_URL: z.string().trim().optional(),
    DB_PATH: z.string().trim().optional(),
    SESSIONPILOT_WORKSPACE_ROOTS: z.string().trim().optional(),
    ANTHROPIC_API_KEY: z.string().trim().optional(),
    GITHUB_TOKEN: z.string().trim().optional(),
  })
  .strict();

function normalizeRoots(rawRoots?: string) {
  return (rawRoots || "")
    .split(",")
    .map((root) => root.trim())
    .filter(Boolean);
}

function isLocalAppUrl(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

async function getWorkspaceRootCheck(
  workspaceRoots: string[],
  nodeEnv: string
): Promise<RuntimeCheck> {
  if (workspaceRoots.length === 0) {
    if (nodeEnv === "production") {
      return {
        status: "error",
        message:
          "SESSIONPILOT_WORKSPACE_ROOTS is required in production-like environments.",
      };
    }

    return {
      status: "warning",
      message:
        "SESSIONPILOT_WORKSPACE_ROOTS is not configured. Development mode will allow manual paths.",
    };
  }

  const inaccessibleRoots: string[] = [];
  for (const root of workspaceRoots) {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) {
        inaccessibleRoots.push(root);
      }
    } catch {
      inaccessibleRoots.push(root);
    }
  }

  if (inaccessibleRoots.length === 0) {
    return {
      status: "ok",
      message: `${workspaceRoots.length} workspace root${
        workspaceRoots.length === 1 ? "" : "s"
      } configured.`,
    };
  }

  if (inaccessibleRoots.length === workspaceRoots.length) {
    return {
      status: "error",
      message:
        "Configured workspace roots are not accessible. Update SESSIONPILOT_WORKSPACE_ROOTS.",
    };
  }

  return {
    status: "warning",
    message: `Some workspace roots are not accessible: ${inaccessibleRoots.join(", ")}`,
  };
}

function getAppUrlCheck(appUrl: string | undefined, nodeEnv: string): RuntimeCheck {
  if (!appUrl) {
    return {
      status: "warning",
      message:
        "NEXT_PUBLIC_APP_URL is not set. Same-origin protections will fall back to localhost defaults.",
    };
  }

  try {
    const parsedUrl = new URL(appUrl);
    if (!isLocalAppUrl(parsedUrl) && nodeEnv !== "production") {
      return {
        status: "warning",
        message:
          "NEXT_PUBLIC_APP_URL points to a non-local host outside production. Verify demo origin settings.",
      };
    }

    return {
      status: "ok",
      message: `API origin locked to ${parsedUrl.origin}.`,
    };
  } catch {
    return {
      status: "error",
      message: "NEXT_PUBLIC_APP_URL must be a valid absolute URL.",
    };
  }
}

export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  const rawConfig = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    DB_PATH: process.env.DB_PATH,
    SESSIONPILOT_WORKSPACE_ROOTS: process.env.SESSIONPILOT_WORKSPACE_ROOTS,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  };
  const parsed = envSchema.safeParse(rawConfig);

  const configValues = parsed.success ? parsed.data : rawConfig;
  const nodeEnv = configValues.NODE_ENV || "development";
  const workspaceRoots = normalizeRoots(configValues.SESSIONPILOT_WORKSPACE_ROOTS);
  const appUrl = configValues.NEXT_PUBLIC_APP_URL?.trim() || undefined;
  const dbPath = configValues.DB_PATH?.trim() || "./session-pilot.db";
  const hasAnthropic = Boolean(configValues.ANTHROPIC_API_KEY?.trim());
  const hasGithubToken = Boolean(configValues.GITHUB_TOKEN?.trim());

  const checks = {
    appUrl: getAppUrlCheck(appUrl, nodeEnv),
    anthropic: hasAnthropic
      ? ({
          status: "ok",
          message: "Claude planning is configured.",
        } satisfies RuntimeCheck)
      : ({
          status: "warning",
          message:
            "ANTHROPIC_API_KEY is missing. Session planning and summaries will use fallback behavior.",
        } satisfies RuntimeCheck),
    github: hasGithubToken
      ? ({
          status: "ok",
          message: "GitHub scanning is configured.",
        } satisfies RuntimeCheck)
      : ({
          status: "warning",
          message: "GITHUB_TOKEN is missing. GitHub signals will be skipped.",
        } satisfies RuntimeCheck),
    workspaceRoots: await getWorkspaceRootCheck(workspaceRoots, nodeEnv),
  };

  if (!parsed.success) {
    return {
      status: "degraded",
      warnings: [
        "Runtime environment contains invalid values.",
        ...parsed.error.issues.map((issue) => issue.message),
      ],
      checks,
      config: {
        appUrl,
        dbPath,
        workspaceRoots,
        hasAnthropic,
        hasGithubToken,
      },
    };
  }

  const warnings = Object.values(checks)
    .filter((check) => check.status !== "ok")
    .map((check) => check.message);

  return {
    status: warnings.length > 0 ? "degraded" : "ok",
    warnings,
    checks,
    config: {
      appUrl,
      dbPath,
      workspaceRoots,
      hasAnthropic,
      hasGithubToken,
    },
  };
}
