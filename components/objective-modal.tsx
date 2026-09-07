"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CycleOption } from "@/components/cycle-selector";
import type { ObjectiveCardData } from "@/components/objective-card";

type ObjectiveSubmitData = {
  title: string;
  description: string;
  level: string;
  status: string;
  progress: number;
  dueDate: string;
  organizationId: string;
  workspaceId: string;
  cycleId: string;
};

type ObjectiveModalObjective = ObjectiveCardData & {
  cycleId?: string;
  level?: string;
  organizationId?: string;
  workspaceId?: string;
};

type ObjectiveModalProps = {
  open: boolean;
  mode: "create" | "edit";
  objective?: ObjectiveModalObjective | null;
  cycles: CycleOption[];
  organizationId?: string;
  workspaceId?: string;
  cycleId?: string;
  onSubmit?: (data: ObjectiveSubmitData) => Promise<void>;
  onClose: () => void;
};

function normalizeObjectiveStatus(status?: string) {
  const statuses: Record<string, string> = {
    "At risk": "AT_RISK",
    Completed: "COMPLETED",
    "Not started": "NOT_STARTED",
    "Off track": "OFF_TRACK",
    "On track": "ON_TRACK",
  };

  return status ? statuses[status] ?? status : "NOT_STARTED";
}

export function ObjectiveModal({
  open,
  mode,
  objective,
  cycles,
  organizationId = "",
  workspaceId = "",
  cycleId = "",
  onSubmit,
  onClose,
}: ObjectiveModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedCycleId(mode === "edit" ? objective?.cycleId ?? "" : "");
  }, [mode, objective?.cycleId, open]);

  if (!open) {
    return null;
  }

  async function submitObjective(data: ObjectiveSubmitData) {
    const response = await fetch("/api/objectives", {
      method: mode === "create" ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body:
        mode === "create"
          ? JSON.stringify({
              ...data,
              organizationId: data.organizationId,
              workspaceId: data.workspaceId,
              cycleId: data.cycleId,
            })
          : JSON.stringify({
              ...data,
              id: objective?.id,
            }),
    });

    if (!response.ok) {
      throw new Error("Failed to save objective");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const getValue = (name: string) => formData.get(name)?.toString() ?? "";
    const progress = Number(getValue("progress"));
    const data = {
      title: getValue("title"),
      description: getValue("description"),
      level: getValue("level") || "TEAM",
      status: normalizeObjectiveStatus(getValue("status")),
      progress: Number.isFinite(progress) ? progress : 0,
      dueDate: getValue("dueDate"),
      organizationId:
        getValue("organizationId") || objective?.organizationId || organizationId,
      workspaceId: getValue("workspaceId") || objective?.workspaceId || workspaceId,
      cycleId: getValue("cycleId") || cycleId,
    };

    setIsSubmitting(true);

    try {
      await (onSubmit ?? submitObjective)(data);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-6 shadow-xl dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">
              {mode === "create" ? "New objective" : "Edit objective"}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">
              {mode === "create" ? "Create an objective" : objective?.title}
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
            name="level"
            type="hidden"
            defaultValue={objective?.level ?? "TEAM"}
          />
          <input
            name="status"
            type="hidden"
            defaultValue={normalizeObjectiveStatus(objective?.status)}
          />
          <input
            name="progress"
            type="hidden"
            defaultValue={objective?.progress ?? 0}
          />
          <input
            name="dueDate"
            type="hidden"
            defaultValue={objective?.dueDate ?? ""}
          />
          <input
            name="organizationId"
            type="hidden"
            defaultValue={objective?.organizationId ?? organizationId}
          />
          <input
            name="workspaceId"
            type="hidden"
            defaultValue={objective?.workspaceId ?? workspaceId}
          />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Title</span>
            <input
              className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              defaultValue={objective?.title}
              name="title"
              placeholder="Launch weekly customer health review"
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Description</span>
            <textarea
              className="min-h-24 rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              defaultValue={objective?.description}
              name="description"
              placeholder="What outcome should the team create?"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Cycle</span>
              <select
                className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                name="cycleId"
                value={selectedCycleId}
                onChange={(event) => setSelectedCycleId(event.target.value)}
              >
                <option value="">Select cycle</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Owner</span>
              <input
                className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                defaultValue={objective?.owner}
                name="owner"
                placeholder="Team owner"
              />
            </label>
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              disabled={isSubmitting}
              type="submit"
            >
              Save objective
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
