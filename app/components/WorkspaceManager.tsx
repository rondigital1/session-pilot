"use client";

import { useState } from "react";
import type { UIWorkspace } from "@/server/types/domain";
import { API } from "@/app/utils/api-routes";
import WorkspaceForm from "./WorkspaceForm";
import WorkspaceScanner from "./WorkspaceScanner";

interface WorkspaceManagerProps {
  workspaces: UIWorkspace[];
  onWorkspacesChange: () => void;
  onClose: () => void;
}

type ActivePanel = "list" | "create" | "edit" | "scanner";

export default function WorkspaceManager({
  workspaces,
  onWorkspacesChange,
  onClose,
}: WorkspaceManagerProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>("list");
  const [editingWorkspace, setEditingWorkspace] = useState<UIWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function handleStartCreate() {
    setActivePanel("create");
    setEditingWorkspace(null);
    setError(null);
  }

  function handleStartEdit(workspace: UIWorkspace) {
    setEditingWorkspace(workspace);
    setActivePanel("edit");
    setError(null);
  }

  function handleFormSuccess() {
    setActivePanel("list");
    setEditingWorkspace(null);
    onWorkspacesChange();
  }

  function handleFormCancel() {
    setActivePanel("list");
    setEditingWorkspace(null);
  }

  async function handleDelete(id: string) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API.workspace(id), {
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
        {activePanel === "list" && (
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
                onClick={() => setActivePanel("scanner")}
              >
                Scan Workspace Repos
              </button>
            </div>
          </>
        )}

        {/* Scanner Panel */}
        {activePanel === "scanner" && (
          <WorkspaceScanner
            workspaces={workspaces}
            onWorkspacesChange={onWorkspacesChange}
            onClose={() => setActivePanel("list")}
          />
        )}

        {/* Create/Edit Form Panel */}
        {(activePanel === "create" || activePanel === "edit") && (
          <WorkspaceForm
            isCreating={activePanel === "create"}
            workspace={editingWorkspace}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        )}
      </div>
    </div>
  );
}
