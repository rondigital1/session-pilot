import { NextRequest } from "next/server";
import {
  getAllowedWorkspaceRoots,
  parseGitHubRepoFromRemote,
  scanForRepositories,
  validatePathWithinRoots,
} from "@/lib/workspace";
import type { DiscoveredRepo } from "@/lib/workspace";
import {
  readJsonBody,
  secureError,
  secureJson,
  validateApiAccess,
} from "@/server/api/http";
import { scanWorkspaceRequestSchema } from "@/server/validation/api";

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
  const securityError = validateApiAccess(request);
  if (securityError) {
    return securityError;
  }

  try {
    const parsedBody = await readJsonBody<ScanRequestBody>(
      request,
      scanWorkspaceRequestSchema
    );
    if (!parsedBody.success) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const requestedPath = body.path?.trim();

    // Determine paths to scan
    let pathsToScan: string[];
    let isWorkspaceRootsScan = false;

    if (requestedPath) {
      const pathValidation = await validatePathWithinRoots(requestedPath);
      if (!pathValidation.valid) {
        return secureError(pathValidation.error || "Invalid scan path", 400);
      }
      pathsToScan = [requestedPath];
    } else {
      // Scan workspace roots from environment
      pathsToScan = getAllowedWorkspaceRoots();
      isWorkspaceRootsScan = true;

      if (pathsToScan.length === 0) {
        return secureError(
          "No workspace roots configured. Set SESSIONPILOT_WORKSPACE_ROOTS in your .env file.",
          400
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

    allRepos.sort((left, right) => left.path.localeCompare(right.path));

    const response: ScanResponseBody = {
      repos: allRepos,
      scannedDirs: totalScannedDirs,
      errors: allErrors,
      ...(isWorkspaceRootsScan && { workspaceRoots: pathsToScan }),
    };

    return secureJson(response);
  } catch (error) {
    console.error("Failed to scan for repositories:", error);
    return secureError("Failed to scan directory", 500);
  }
}
