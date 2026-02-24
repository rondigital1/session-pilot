import { NextRequest, NextResponse } from "next/server";
import { scanForRepositories, parseGitHubRepoFromRemote } from "@/lib/workspace";
import type { DiscoveredRepo } from "@/lib/workspace";
import { validateCsrfProtection, addSecurityHeaders } from "@/lib/security";

// Force Node.js runtime for file system access
export const runtime = "nodejs";

export interface ScanRequestBody {
  path?: string;
  maxDepth?: number;
}

export interface ScanResponseBody {
  repos: Array<{
    name: string;
    path: string;
    hasGit: boolean;
    hasPackageJson: boolean;
    githubRepo?: string;
    description?: string;
  }>;
  scannedDirs: number;
  errors: string[];
  workspaceRoots?: string[];
}

/**
 * Get workspace roots from environment variable
 */
function getWorkspaceRoots(): string[] {
  const rootsEnv = process.env.SESSIONPILOT_WORKSPACE_ROOTS;
  if (!rootsEnv) {
    return [];
  }
  return rootsEnv
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * POST /api/workspaces/scan
 *
 * Scan directories for git repositories that can be added as workspaces.
 *
 * If no path is provided, scans all SESSIONPILOT_WORKSPACE_ROOTS directories.
 *
 * Request body:
 * {
 *   path?: string,     // Directory to scan (optional - uses workspace roots if not provided)
 *   maxDepth?: number  // How deep to scan (default: 2, max: 10)
 * }
 *
 * Response:
 * {
 *   repos: [...],      // Discovered repositories
 *   scannedDirs: number,
 *   errors: string[],
 *   workspaceRoots?: string[]  // Included when scanning workspace roots
 * }
 */
export async function POST(request: NextRequest) {
  const csrfError = validateCsrfProtection(request);
  if (csrfError) return addSecurityHeaders(csrfError);

  try {
    const body: ScanRequestBody = await request.json();

    // Validate maxDepth if provided
    if (body.maxDepth !== undefined) {
      if (
        !Number.isInteger(body.maxDepth) ||
        body.maxDepth < 1 ||
        body.maxDepth > 10
      ) {
        return addSecurityHeaders(
          NextResponse.json(
            { error: "maxDepth must be a positive integer no greater than 10" },
            { status: 400 }
          )
        );
      }
    }

    // Determine paths to scan
    let pathsToScan: string[];
    let isWorkspaceRootsScan = false;

    if (body.path) {
      pathsToScan = [body.path];
    } else {
      // Scan workspace roots from environment
      pathsToScan = getWorkspaceRoots();
      isWorkspaceRootsScan = true;

      if (pathsToScan.length === 0) {
        return addSecurityHeaders(
          NextResponse.json(
            {
              error:
                "No workspace roots configured. Set SESSIONPILOT_WORKSPACE_ROOTS in your .env file.",
            },
            { status: 400 }
          )
        );
      }
    }

    // Scan all paths and aggregate results
    const allRepos: Array<{
      name: string;
      path: string;
      hasGit: boolean;
      hasPackageJson: boolean;
      githubRepo?: string;
      description?: string;
    }> = [];
    let totalScannedDirs = 0;
    const allErrors: string[] = [];

    for (const scanPath of pathsToScan) {
      try {
        const result = await scanForRepositories({
          rootPath: scanPath,
          maxDepth: body.maxDepth ?? 2,
          includeHidden: false,
        });

        // Transform repos to include parsed GitHub info
        const repos = result.repos.map((repo: DiscoveredRepo) => ({
          name: repo.name,
          path: repo.path,
          hasGit: repo.hasGit,
          hasPackageJson: repo.hasPackageJson,
          githubRepo: repo.gitRemote
            ? parseGitHubRepoFromRemote(repo.gitRemote)
            : undefined,
          description: repo.description,
        }));

        allRepos.push(...repos);
        totalScannedDirs += result.scannedDirs;
        allErrors.push(...result.errors);
      } catch (err) {
        allErrors.push(
          `Failed to scan ${scanPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const response: ScanResponseBody = {
      repos: allRepos,
      scannedDirs: totalScannedDirs,
      errors: allErrors,
      ...(isWorkspaceRootsScan && { workspaceRoots: pathsToScan }),
    };

    return addSecurityHeaders(NextResponse.json(response));
  } catch (error) {
    console.error("Failed to scan for repositories:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to scan directory" }, { status: 500 })
    );
  }
}
