"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ObjectiveCardData } from "@/components/objective-card";

type CheckInFormData = {
  note: string;
  confidence: string;
  progress: number;
  value: number;
  organizationId: string;
  workspaceId?: string;
} & CheckInTargetIds;

type CheckInTargetIds =
  | {
      objectiveId: string;
      keyResultId?: string;
      metricId?: string;
    }
  | {
      objectiveId?: string;
      keyResultId: string;
      metricId?: string;
    }
  | {
      objectiveId?: string;
      keyResultId?: string;
      metricId: string;
    };

type OptionalCheckInTargetIds = Partial<Record<keyof CheckInTargetIds, string>>;

type CheckInSubmitHandler = {
  bivarianceHack(data: CheckInFormData): Promise<void>;
}["bivarianceHack"];

type CheckInModalTargetProps =
  | (CheckInTargetIds & {
      objective?: ObjectiveCardData | null;
    })
  | {
      objective: ObjectiveCardData | null;
      objectiveId?: string;
      keyResultId?: string;
      metricId?: string;
    };

type CheckInModalProps = CheckInModalTargetProps & {
  open: boolean;
  onClose: () => void;
  onSubmit?: CheckInSubmitHandler;
};

type ObjectiveWithCheckInDefaults = ObjectiveCardData & {
  confidence?: string;
};

async function submitCheckIn(data: CheckInFormData) {
  if (!data.organizationId) {
    throw new Error("Missing check-in context");
  }

  const targetIds = getCheckInTargetIds(data);
  const payload = {
    note: data.note.trim() || undefined,
    confidence: normalizeConfidence(data.confidence),
    progress: normalizeProgress(data.progress),
    value: Number.isFinite(data.value) ? data.value : undefined,
    organizationId: data.organizationId,
    ...(data.workspaceId ? { workspaceId: data.workspaceId } : {}),
    ...targetIds,
  };

  const response = await fetch("/api/checkins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Failed to save check-in");
  }
}

function normalizeConfidence(value?: string) {
  const normalized = value?.toUpperCase();

  return normalized === "HIGH" ||
    normalized === "MEDIUM" ||
    normalized === "LOW"
    ? normalized
    : "HIGH";
}

function normalizeProgress(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function getFormValue(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function getOptionalFormValue(formData: FormData, name: string) {
  return getFormValue(formData, name) || undefined;
}

function getCheckInTargetIds({
  objectiveId,
  keyResultId,
  metricId,
}: OptionalCheckInTargetIds): CheckInTargetIds {
  const targetIds = {
    ...(objectiveId ? { objectiveId } : {}),
    ...(keyResultId ? { keyResultId } : {}),
    ...(metricId ? { metricId } : {}),
  };

  if (!targetIds.objectiveId && !targetIds.keyResultId && !targetIds.metricId) {
    throw new Error("Missing check-in target");
  }

  return targetIds as CheckInTargetIds;
}

export function CheckInModal({
  open,
  objective,
  objectiveId: providedObjectiveId,
  keyResultId: providedKeyResultId,
  metricId: providedMetricId,
  onClose,
  onSubmit = submitCheckIn,
}: CheckInModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [
    open,
    objective?.id,
    providedObjectiveId,
    providedKeyResultId,
    providedMetricId,
  ]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const objectiveDefaults = objective as ObjectiveWithCheckInDefaults | null;
    const fallbackProgress = objective?.progress ?? 0;
    const progressValue = Number(getFormValue(formData, "progress"));
    const metricValue = Number(getFormValue(formData, "value"));
    const organizationId =
      getFormValue(formData, "organizationId") ||
      objectiveDefaults?.organizationId ||
      "";
    const objectiveId =
      getOptionalFormValue(formData, "objectiveId") ||
      providedObjectiveId ||
      objectiveDefaults?.id;
    const keyResultId =
      getOptionalFormValue(formData, "keyResultId") || providedKeyResultId;
    const metricId =
      getOptionalFormValue(formData, "metricId") || providedMetricId;
    const workspaceId =
      getFormValue(formData, "workspaceId") ||
      objectiveDefaults?.workspaceId ||
      undefined;
    setIsSubmitting(true);
    setError(null);

    try {
      const targetIds = getCheckInTargetIds({
        objectiveId,
        keyResultId,
        metricId,
      });
      await onSubmit({
        note: getFormValue(formData, "note"),
        confidence: normalizeConfidence(getFormValue(formData, "confidence")),
        progress: Number.isFinite(progressValue)
          ? normalizeProgress(progressValue)
          : normalizeProgress(fallbackProgress),
        value: Number.isFinite(metricValue) ? metricValue : 0,
        organizationId,
        workspaceId,
        ...targetIds,
      });
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save check-in",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const objectiveDefaults = objective as ObjectiveWithCheckInDefaults | null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">AI check-in</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">
              {objective?.title ?? "Create a weekly update"}
            </h2>
          </div>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <input
            name="organizationId"
            type="hidden"
            value={objectiveDefaults?.organizationId ?? ""}
            readOnly
          />
          <input
            name="workspaceId"
            type="hidden"
            value={objectiveDefaults?.workspaceId ?? ""}
            readOnly
          />
          <input
            name="objectiveId"
            type="hidden"
            value={providedObjectiveId ?? objective?.id ?? ""}
            readOnly
          />
          <input
            name="keyResultId"
            type="hidden"
            value={providedKeyResultId ?? ""}
            readOnly
          />
          <input
            name="metricId"
            type="hidden"
            value={providedMetricId ?? ""}
            readOnly
          />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Confidence</span>
            <select
              className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              defaultValue={normalizeConfidence(objectiveDefaults?.confidence)}
              name="confidence"
            >
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Progress update</span>
            <textarea
              className="min-h-32 rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              name="note"
              defaultValue={
                objective
                  ? `AI draft: ${objective.title} is at ${objective.progress}%. Key results are moving, with one area needing attention before the next review.`
                  : "AI draft: Summarize progress, blockers, and the next action for this week's OKR review."
              }
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Progress</span>
              <input
                className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                defaultValue={objective?.progress ?? 0}
                max="100"
                min="0"
                name="progress"
                type="number"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Value</span>
              <input
                className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                defaultValue={0}
                name="value"
                type="number"
              />
            </label>
          </div>

          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            Suggested next action: turn the biggest blocker into an owner-backed
            task before saving the check-in.
          </div>

          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              Save check-in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
