"use client";

import { useState, type FormEvent } from "react";
import type { ObjectiveCardData } from "@/components/objective-card";

type CheckInFormData = {
  note: string;
  confidence: string;
  progress: number;
  value: number;
  organizationId: string;
  objectiveId: string;
};

type CheckInModalProps = {
  open: boolean;
  objective?: ObjectiveCardData | null;
  onClose: () => void;
  onSubmit?: (data: CheckInFormData) => Promise<void>;
};

type ObjectiveWithCheckInDefaults = ObjectiveCardData & {
  confidence?: string;
  organizationId?: string;
};

async function submitCheckIn(data: CheckInFormData) {
  const response = await fetch("/api/checkins", {
    method: "POST",
    body: JSON.stringify({
      ...data,
      organizationId: data.organizationId,
      objectiveId: data.objectiveId,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to save check-in");
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

export function CheckInModal({
  open,
  objective,
  onClose,
  onSubmit = submitCheckIn,
}: CheckInModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const objectiveDefaults = objective as ObjectiveWithCheckInDefaults | null;
    const progress = Number(formData.get("progress") ?? 0);
    const value = Number(formData.get("value") ?? 0);

    setIsSubmitting(true);

    try {
      await onSubmit({
        note: String(formData.get("note") ?? ""),
        confidence: String(formData.get("confidence") ?? "HIGH"),
        progress,
        value,
        organizationId: String(
          formData.get("organizationId") ?? objectiveDefaults?.organizationId ?? "",
        ),
        objectiveId: String(
          formData.get("objectiveId") ?? objectiveDefaults?.id ?? "",
        ),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  const objectiveDefaults = objective as ObjectiveWithCheckInDefaults | null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-white p-6 shadow-xl dark:bg-slate-950">
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
          />
          <input name="objectiveId" type="hidden" value={objective?.id ?? ""} />
          <input
            name="progress"
            type="hidden"
            value={objective?.progress ?? 0}
          />
          <input name="value" type="hidden" value={objective?.progress ?? 0} />
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

          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            Suggested next action: turn the biggest blocker into an owner-backed
            task before saving the check-in.
          </div>

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
