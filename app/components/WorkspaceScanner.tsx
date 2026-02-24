"use client";

import { useState } from "react";
import type { UIWorkspace } from "@/server/types/domain";
import { API } from "@/app/utils/api-routes";

interface DiscoveredRepo {
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  githubRepo?: string;
  description?: string;
}

interface WorkspaceScannerProps {
  workspaces: UIWorkspace[];
  onWorkspacesChange: () => void;
  onClose: () => void;
}

export default function WorkspaceScanner({
  workspaces,
  onWorkspacesChange,
  onClose,
}: WorkspaceScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);

  async function handleScanWorkspaceRoots() {
    setIsScanning(true);
    setScanError(null);
    setDiscoveredRepos([]);
    setSelectedRepos(new Set());

    try {
      const response = await fetch(API.workspaceScan, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDepth: 2 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to scan workspace roots");
      }

      // Filter out repos that are already workspaces
      const existingPaths = new Set(workspaces.map((w) => w.localPath));
      const newRepos = data.repos.filter(
        (repo: DiscoveredRepo) => !existingPaths.has(repo.path)
      );

      setDiscoveredRepos(newRepos);

      if (newRepos.length === 0 && data.repos.length > 0) {
        setScanError("All discovered repositories are already added as workspaces");
      } else if (newRepos.length === 0) {
        setScanError("No repositories found in workspace roots");
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  }

  function toggleRepoSelection(repoPath: string) {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(repoPath)) {
      newSelected.delete(repoPath);
    } else {
      newSelected.add(repoPath);
    }
    setSelectedRepos(newSelected);
  }

  function selectAllRepos() {
    setSelectedRepos(new Set(discoveredRepos.map((r) => r.path)));
  }

  function deselectAllRepos() {
    setSelectedRepos(new Set());
  }

  async function handleImportSelected() {
    if (selectedRepos.size === 0) return;

    setIsLoading(true);
    setScanError(null);

    const reposToImport = discoveredRepos.filter((r) => selectedRepos.has(r.path));
    const errors: string[] = [];

    for (const repo of reposToImport) {
      try {
        const response = await fetch(API.workspaces, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: repo.name,
            localPath: repo.path,
            githubRepo: repo.githubRepo || undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          errors.push(`${repo.name}: ${data.error}`);
        }
      } catch {
        errors.push(`${repo.name}: Failed to import`);
      }
    }

    setIsLoading(false);

    if (errors.length > 0) {
      setScanError(`Some imports failed: ${errors.join(", ")}`);
    }

    // Remove imported repos from the list
    setDiscoveredRepos((prev) =>
      prev.filter((r) => !selectedRepos.has(r.path) || errors.some((e) => e.startsWith(r.name)))
    );
    setSelectedRepos(new Set());
    onWorkspacesChange();
  }

  // Auto-scan on mount
  if (!isScanning && discoveredRepos.length === 0 && !scanError) {
    void handleScanWorkspaceRoots();
  }

  return (
    <div className="folder-scanner">
      <div className="scanner-header">
        <h3>Discovered Repositories</h3>
        <button
          className="btn btn-outline btn-sm"
          onClick={onClose}
        >
          Back
        </button>
      </div>

      {isScanning && (
        <div className="scanning-indicator">
          <p className="text-muted">Scanning workspace roots...</p>
        </div>
      )}

      {scanError && <div className="error-message">{scanError}</div>}

      {discoveredRepos.length > 0 && (
        <>
          <div className="scanner-results-header">
            <span className="text-muted">
              Found {discoveredRepos.length} project{discoveredRepos.length !== 1 ? "s" : ""}
            </span>
            <div className="scanner-select-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={selectAllRepos}
              >
                Select All
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={deselectAllRepos}
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="discovered-repos-list">
            {discoveredRepos.map((repo) => (
              <label key={repo.path} className="discovered-repo-item">
                <input
                  type="checkbox"
                  checked={selectedRepos.has(repo.path)}
                  onChange={() => toggleRepoSelection(repo.path)}
                />
                <div className="repo-info">
                  <div className="repo-name">
                    {repo.name}
                    {repo.hasGit && <span className="badge badge-sm">git</span>}
                    {repo.hasPackageJson && <span className="badge badge-sm">npm</span>}
                  </div>
                  <div className="repo-path">{repo.path}</div>
                  {repo.description && (
                    <div className="repo-description">{repo.description}</div>
                  )}
                  {repo.githubRepo && (
                    <div className="repo-github">{repo.githubRepo}</div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={handleImportSelected}
            disabled={selectedRepos.size === 0 || isLoading}
          >
            {isLoading
              ? "Importing..."
              : `Import ${selectedRepos.size} Selected`}
          </button>
        </>
      )}
    </div>
  );
}
