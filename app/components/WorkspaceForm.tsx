"use client";

import { useState, useMemo } from "react";
import type { UIWorkspace } from "@/server/types/domain";
import {
  validateWorkspaceForm,
} from "@/app/utils/workspace-validation";
import { API } from "@/app/utils/api-routes";

interface WorkspaceFormData {
  name: string;
  localPath: string;
  githubRepo: string;
}

interface WorkspaceFormProps {
  isCreating: boolean;
  workspace?: UIWorkspace | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const emptyForm: WorkspaceFormData = {
  name: "",
  localPath: "",
  githubRepo: "",
};

export default function WorkspaceForm({
  isCreating,
  workspace,
  onSuccess,
  onCancel,
}: WorkspaceFormProps) {
  const [formData, setFormData] = useState<WorkspaceFormData>(
    workspace
      ? {
          name: workspace.name,
          localPath: workspace.localPath || "",
          githubRepo: workspace.githubRepo || "",
        }
      : emptyForm
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const validation = useMemo(
    () => validateWorkspaceForm(formData),
    [formData]
  );

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isCreating) {
        const response = await fetch(API.workspaces, {
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
      } else if (workspace) {
        const response = await fetch(API.workspace(workspace.id), {
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

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="workspace-form">
      <h3>{isCreating ? "New Workspace" : "Edit Workspace"}</h3>

      {error && <div className="error-message">{error}</div>}

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
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!validation.valid || isLoading}
        >
          {isLoading
            ? "Saving..."
            : isCreating
            ? "Create Workspace"
            : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
