"use client";

import { useState } from "react";
import { ProgressBar } from "@/components/progress-bar";

type KeyResultConfidence = "High" | "Medium" | "Low";

export type KeyResultGitHubIntegration = {
  repository?: string | null;
  branch?: string | null;
  incrementBy?: number | null;
};

export type KeyResultRowData = {
  id: string;
  title: string;
  owner: string;
  progress: number;
  currentValue: number;
  targetValue: number;
  unit?: string;
  confidence: KeyResultConfidence;
  gitHubIntegration?: KeyResultGitHubIntegration | null;
};

export type KeyResultUpdateData = {
  currentValue: number;
  confidence: KeyResultConfidence;
  gitHubIntegration?: {
    enabled: boolean;
    repository?: string;
    branch?: string;
    incrementBy?: number;
  };
};

type KeyResultRowProps = {
  keyResult: KeyResultRowData;
  onEdit?: (
    keyResult: KeyResultRowData,
    updates: KeyResultUpdateData,
  ) => Promise<void>;
};

const confidenceStyles: Record<KeyResultConfidence, string> = {
  High: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-rose-50 text-rose-700 ring-rose-200",
};

const confidenceOptions: KeyResultConfidence[] = ["High", "Medium", "Low"];

function formatValue(value: number, unit?: string) {
  return `${value}${unit ?? ""}`;
}

export function KeyResultRow({ keyResult, onEdit }: KeyResultRowProps) {
  const gitHubIntegration = keyResult.gitHubIntegration ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentValue, setCurrentValue] = useState(
    String(keyResult.currentValue),
  );
  const [confidence, setConfidence] = useState<KeyResultConfidence>(
    keyResult.confidence,
  );
  const [githubEnabled, setGithubEnabled] = useState(Boolean(gitHubIntegration));
  const [repository, setRepository] = useState(
    gitHubIntegration?.repository ?? "",
  );
  const [branch, setBranch] = useState(gitHubIntegration?.branch ?? "");
  const [incrementBy, setIncrementBy] = useState(
    String(gitHubIntegration?.incrementBy ?? 1),
  );

  const valueLabel = `${formatValue(
    keyResult.currentValue,
    keyResult.unit,
  )} / ${formatValue(keyResult.targetValue, keyResult.unit)}`;

  function resetEditor() {
    const nextGitHubIntegration = keyResult.gitHubIntegration ?? null;
    setCurrentValue(String(keyResult.currentValue));
    setConfidence(keyResult.confidence);
    setGithubEnabled(Boolean(nextGitHubIntegration));
    setRepository(nextGitHubIntegration?.repository ?? "");
    setBranch(nextGitHubIntegration?.branch ?? "");
    setIncrementBy(String(nextGitHubIntegration?.incrementBy ?? 1));
    setError(null);
  }

  async function handleSave() {
    if (!onEdit) {
      return;
    }

    const parsedCurrentValue = Number(currentValue);
    const parsedIncrementBy = Number(incrementBy);

    if (!Number.isFinite(parsedCurrentValue)) {
      setError("Current value must be a number.");
      return;
    }

    if (githubEnabled && !repository.trim()) {
      setError("Add a GitHub repository in owner/repo format.");
      return;
    }

    if (githubEnabled && !Number.isFinite(parsedIncrementBy)) {
      setError("PR increment must be a number.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onEdit(keyResult, {
        currentValue: parsedCurrentValue,
        confidence,
        gitHubIntegration: {
          enabled: githubEnabled,
          repository: repository.trim() || undefined,
          branch: branch.trim() || undefined,
          incrementBy: githubEnabled ? parsedIncrementBy : undefined,
        },
      });
      setIsEditing(false);
    } catch {
      setError("Could not save key result.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-slate-50 p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_160px_88px_auto] md:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{keyResult.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {keyResult.owner} · {valueLabel}
          </p>
        </div>

        <ProgressBar value={keyResult.progress} size="sm" />

        <span
          className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium ring-1 ${confidenceStyles[keyResult.confidence]}`}
        >
          {keyResult.confidence}
        </span>

        {onEdit ? (
          <button
            className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            type="button"
            onClick={() => {
              resetEditor();
              setIsEditing(true);
            }}
          >
            Edit
          </button>
        ) : null}
      </div>

      {gitHubIntegration?.repository ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">GitHub PRs</span>
          <span className="ml-2">
            {gitHubIntegration.repository}
            {gitHubIntegration.branch ? `:${gitHubIntegration.branch}` : ""}
          </span>
          <span className="ml-2 text-muted-foreground">
            +{gitHubIntegration.incrementBy ?? 1} per merged PR
          </span>
        </div>
      ) : null}

      {isEditing ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-medium text-slate-600">
              Current value
              <input
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
                inputMode="decimal"
                type="number"
                value={currentValue}
                onChange={(event) => setCurrentValue(event.target.value)}
              />
            </label>

            <label className="text-xs font-medium text-slate-600">
              Confidence
              <select
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
                value={confidence}
                onChange={(event) =>
                  setConfidence(event.target.value as KeyResultConfidence)
                }
              >
                {confidenceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-end gap-2 text-xs font-medium text-slate-600">
              <input
                className="mb-2 h-4 w-4 rounded border-border"
                checked={githubEnabled}
                type="checkbox"
                onChange={(event) => setGithubEnabled(event.target.checked)}
              />
              Track merged GitHub PRs
            </label>
          </div>

          {githubEnabled ? (
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_120px]">
              <label className="text-xs font-medium text-slate-600">
                Repository
                <input
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="owner/repo"
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                Branch
                <input
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="main"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                PR increment
                <input
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
                  min="0"
                  step="1"
                  type="number"
                  value={incrementBy}
                  onChange={(event) => setIncrementBy(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-xs text-rose-700">{error}</p> : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={() => {
                resetEditor();
                setIsEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
