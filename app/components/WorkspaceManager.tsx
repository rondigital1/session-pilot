"use client";

import { useState, useMemo } from "react";
import type { UIWorkspace } from "@/server/types/domain";
import {
  validateWorkspaceForm,
  validateWorkspaceName,
  validateLocalPath,
  validateGitHubRepo,
} from "@/app/utils/workspace-validation";

interface WorkspaceManagerProps {
  workspaces: UIWorkspace[];
  onWorkspacesChange: () => void;
  onClose: () => void;
}

interface WorkspaceFormData {
  name: string;
  localPath: string;
  githubRepo: string;
}

interface DiscoveredRepo {
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  githubRepo?: string;
  description?: string;
}

const emptyForm: WorkspaceFormData = {
  name: "",
  localPath: "",
  githubRepo: "",
};

export default function WorkspaceManager({
  workspaces,
  onWorkspacesChange,
  onClose,
}: WorkspaceManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WorkspaceFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Folder scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  // Compute validation state
  const validation = useMemo(
    () => validateWorkspaceForm(formData),
    [formData]
  );

  // Field-specific validation (only show after field is touched)
  const fieldErrors = useMemo(() => {
    const errors: typeof validation.errors = {};
    if (touchedFields.has("name") && validation.errors.name) {
      errors.name = validation.errors.name;
    }
    if (touchedFields.has("localPath") && validation.errors.localPath) {
      errors.localPath = validation.errors.localPath;
    }
    if (touchedFields.has("githubRepo") && validation.errors.githubRepo) {
      errors.githubRepo = validation.errors.githubRepo;
    }
    // Show form-level error only after both path fields are touched
    if (
      touchedFields.has("localPath") &&
      touchedFields.has("githubRepo") &&
      validation.errors.form
    ) {
      errors.form = validation.errors.form;
    }
    return errors;
  }, [validation.errors, touchedFields]);

  function handleFieldBlur(fieldName: string) {
    setTouchedFields((prev) => new Set(prev).add(fieldName));
  }

  function handleStartCreate() {
    setIsCreating(true);
    setEditingId(null);
    setFormData(emptyForm);
    setError(null);
    setTouchedFields(new Set());
  }

  function handleStartEdit(workspace: UIWorkspace) {
    setEditingId(workspace.id);
    setIsCreating(false);
    setFormData({
      name: workspace.name,
      localPath: workspace.localPath || "",
      githubRepo: workspace.githubRepo || "",
    });
    setError(null);
    setTouchedFields(new Set());
  }

  function handleCancel() {
    setIsCreating(false);
    setEditingId(null);
    setFormData(emptyForm);
    setError(null);
    setTouchedFields(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isCreating) {
        const response = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            localPath: formData.localPath,
            githubRepo: formData.githubRepo || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create workspace");
        }
      } else if (editingId) {
        const response = await fetch(`/api/workspaces/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            localPath: formData.localPath,
            githubRepo: formData.githubRepo || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to update workspace");
        }
      }

      handleCancel();
      onWorkspacesChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete workspace");
      }

      setDeleteConfirmId(null);
      onWorkspacesChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  // Scan workspace roots automatically
  async function handleScanWorkspaceRoots() {
    setShowScanner(true);
    setIsScanning(true);
    setScanError(null);
    setDiscoveredRepos([]);
    setSelectedRepos(new Set());

    try {
      // Call scan API without a path to use workspace roots
      const response = await fetch("/api/workspaces/scan", {
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

  function toggleRepoSelection(path: string) {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
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
        const response = await fetch("/api/workspaces", {
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

  function handleCloseScanner() {
    setShowScanner(false);
    setDiscoveredRepos([]);
    setSelectedRepos(new Set());
    setScanError(null);
  }

  const isFormValid = validation.valid;

  return (
    <div className="workspace-manager-overlay">
      <div className="workspace-manager panel">
        <div className="panel-header row">
          <div>
            <h2>Manage Workspaces</h2>
            <p>Add, edit, or remove your project workspaces.</p>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Workspace List */}
        {!isCreating && !editingId && (
          <>
            <div className="workspace-list">
              {workspaces.length === 0 ? (
                <div className="empty-state">
                  <p className="text-muted">No workspaces yet.</p>
                  <p className="text-muted">Create one to get started.</p>
                </div>
              ) : (
                workspaces.map((ws) => (
                  <div key={ws.id} className="workspace-card">
                    {deleteConfirmId === ws.id ? (
                      <div className="delete-confirm">
                        <p>Delete "{ws.name}"?</p>
                        <div className="delete-confirm-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={isLoading}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(ws.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="workspace-card-info">
                          <h4>{ws.name}</h4>
                          {ws.localPath && (
                            <p className="workspace-path">{ws.localPath}</p>
                          )}
                          {ws.githubRepo && (
                            <p className="workspace-repo">
                              <span className="repo-icon">&#9741;</span>
                              {ws.githubRepo}
                            </p>
                          )}
                        </div>
                        <div className="workspace-card-actions">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleStartEdit(ws)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setDeleteConfirmId(ws.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="workspace-actions-row">
              <button
                className="btn btn-primary"
                onClick={handleStartCreate}
              >
                Add Workspace
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleScanWorkspaceRoots}
                disabled={isScanning}
              >
                {isScanning ? "Scanning..." : "Scan Workspace Repos"}
              </button>
            </div>
          </>
        )}

        {/* Folder Scanner */}
        {showScanner && !isCreating && !editingId && (
          <div className="folder-scanner">
            <div className="scanner-header">
              <h3>Discovered Repositories</h3>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleCloseScanner}
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
        )}

        {/* Create/Edit Form */}
        {(isCreating || editingId) && (
          <form onSubmit={handleSubmit} className="workspace-form">
            <h3>{isCreating ? "New Workspace" : "Edit Workspace"}</h3>

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.name ? "form-input-error" : ""}`}
                placeholder="My Project"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                onBlur={() => handleFieldBlur("name")}
                autoFocus
              />
              {fieldErrors.name && (
                <p className="form-error">{fieldErrors.name}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Local Path</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.localPath ? "form-input-error" : ""}`}
                placeholder="/Users/you/projects/my-project"
                value={formData.localPath}
                onChange={(e) =>
                  setFormData({ ...formData, localPath: e.target.value })
                }
                onBlur={() => handleFieldBlur("localPath")}
              />
              {fieldErrors.localPath ? (
                <p className="form-error">{fieldErrors.localPath}</p>
              ) : (
                <p className="form-hint">
                  Absolute path to your project directory (required if no GitHub repo)
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">GitHub Repository</label>
              <input
                type="text"
                className={`form-input ${fieldErrors.githubRepo ? "form-input-error" : ""}`}
                placeholder="owner/repo"
                value={formData.githubRepo}
                onChange={(e) =>
                  setFormData({ ...formData, githubRepo: e.target.value })
                }
                onBlur={() => handleFieldBlur("githubRepo")}
              />
              {fieldErrors.githubRepo ? (
                <p className="form-error">{fieldErrors.githubRepo}</p>
              ) : (
                <p className="form-hint">
                  Format: owner/repo or full GitHub URL (required if no local path)
                </p>
              )}
            </div>

            {fieldErrors.form && (
              <div className="form-error-banner">{fieldErrors.form}</div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!isFormValid || isLoading}
              >
                {isLoading
                  ? "Saving..."
                  : isCreating
                  ? "Create Workspace"
                  : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
