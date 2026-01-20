import * as fs from "fs/promises";
import * as path from "path";

export interface GlobOptions {
  cwd: string;
  extensions?: string[];
  ignore?: string[];
}

/**
 * Find files matching given extensions, respecting ignore patterns.
 */
export async function findFiles(options: GlobOptions): Promise<string[]> {
  const { cwd, extensions = [], ignore = [] } = options;
  const results: string[] = [];

  // Pre-compile ignore patterns to regexes
  const ignoreRegexes = ignore.map((pattern) => {
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/{{GLOBSTAR}}/g, ".*");
    return new RegExp(`^${regexStr}`);
  });

  const shouldIgnore = (relPath: string): boolean =>
    ignoreRegexes.some((re) => re.test(relPath));

  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;

      if (shouldIgnore(relPath)) continue;

      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.length === 0 || extensions.includes(ext)) {
          results.push(relPath);
        }
      }
    }
  }

  await walk(cwd, "");
  return results;
}

/**
 * Read multiple files in parallel, returning content mapped by path.
 * Skips files that fail to read.
 */
export async function readFiles(
  basePath: string,
  filePaths: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const content = await fs.readFile(
          path.join(basePath, filePath),
          "utf-8"
        );
        results.set(filePath, content);
      } catch {
        // Skip files that can't be read
      }
    })
  );

  return results;
}
