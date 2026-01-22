/**
 * Workspace Scanner
 *
 * Scans a directory for git repositories that can be added as workspaces.
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface DiscoveredRepo {
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  gitRemote?: string;
  description?: string;
}

export interface ScanOptions {
  /** Root directory to scan */
  rootPath: string;
  /** Maximum depth to scan (default: 2) */
  maxDepth?: number;
  /** Include hidden directories (default: false) */
  includeHidden?: boolean;
}

export interface ScanResult {
  repos: DiscoveredRepo[];
  scannedDirs: number;
  errors: string[];
}

/**
 * Check if a directory is a git repository
 */
async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const gitPath = path.join(dirPath, ".git");
    const stats = await fs.stat(gitPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Try to get the git remote URL
 */
async function getGitRemote(dirPath: string): Promise<string | undefined> {
  try {
    const configPath = path.join(dirPath, ".git", "config");
    const content = await fs.readFile(configPath, "utf-8");

    // Parse git config for remote origin URL
    const match = content.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
    if (match) {
      return match[1].trim();
    }
  } catch {
    // No remote configured
  }
  return undefined;
}

/**
 * Try to get project description from package.json
 */
async function getPackageInfo(
  dirPath: string
): Promise<{ hasPackageJson: boolean; description?: string }> {
  try {
    const pkgPath = path.join(dirPath, "package.json");
    const content = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    return {
      hasPackageJson: true,
      description: pkg.description,
    };
  } catch {
    return { hasPackageJson: false };
  }
}

/**
 * Scan a directory for git repositories
 *
 * Walks the directory tree up to maxDepth levels, looking for directories
 * that contain a .git folder.
 */
export async function scanForRepositories(
  options: ScanOptions
): Promise<ScanResult> {
  const { rootPath, maxDepth = 2, includeHidden = false } = options;
  const repos: DiscoveredRepo[] = [];
  const errors: string[] = [];
  let scannedDirs = 0;

  async function scan(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      scannedDirs++;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip hidden directories unless explicitly included
        if (!includeHidden && entry.name.startsWith(".")) continue;

        // Skip common non-project directories
        if (["node_modules", "vendor", ".git", "dist", "build", "__pycache__"].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        // Check if this directory is a git repo
        const hasGit = await isGitRepo(fullPath);

        if (hasGit) {
          // Found a repo - gather info about it
          const gitRemote = await getGitRemote(fullPath);
          const pkgInfo = await getPackageInfo(fullPath);

          repos.push({
            name: entry.name,
            path: fullPath,
            hasGit: true,
            hasPackageJson: pkgInfo.hasPackageJson,
            gitRemote,
            description: pkgInfo.description,
          });

          // Don't recurse into git repos (they're self-contained)
          continue;
        }

        // Not a git repo, but might be a project directory (e.g., has package.json)
        const pkgInfo = await getPackageInfo(fullPath);
        if (pkgInfo.hasPackageJson) {
          repos.push({
            name: entry.name,
            path: fullPath,
            hasGit: false,
            hasPackageJson: true,
            description: pkgInfo.description,
          });
          continue;
        }

        // Recurse into subdirectories
        await scan(fullPath, depth + 1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Error scanning ${dirPath}: ${message}`);
    }
  }

  // Validate root path exists
  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      return {
        repos: [],
        scannedDirs: 0,
        errors: [`Path is not a directory: ${rootPath}`],
      };
    }
  } catch {
    return {
      repos: [],
      scannedDirs: 0,
      errors: [`Cannot access path: ${rootPath}`],
    };
  }

  await scan(rootPath, 0);

  // Sort repos by name
  repos.sort((a, b) => a.name.localeCompare(b.name));

  return { repos, scannedDirs, errors };
}

/**
 * Convert a git remote URL to a GitHub repo identifier (owner/repo)
 */
export function parseGitHubRepoFromRemote(remote: string): string | undefined {
  // Handle SSH format: git@github.com:owner/repo.git
  const sshMatch = remote.match(/git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[1];
  }

  // Handle HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = remote.match(/https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  return undefined;
}
