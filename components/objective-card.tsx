import {
  KeyResultRow,
  type KeyResultRowData,
} from "@/components/keyresult-row";
import { ProgressBar } from "@/components/progress-bar";

export type ObjectiveCardData = {
  id: string;
  title: string;
  description: string;
  owner: string;
  team: string;
  status: "Not started" | "On track" | "At risk" | "Off track" | "Completed";
  progress: number;
  dueDate: string;
  keyResults: KeyResultRowData[];
};

type ObjectiveCardProps = {
  objective: ObjectiveCardData;
  onCheckIn: (objective: ObjectiveCardData) => void;
  onDelete: (objective: ObjectiveCardData) => void;
  onEdit: (objective: ObjectiveCardData) => void;
};

const statusStyles: Record<ObjectiveCardData["status"], string> = {
  "Not started": "bg-slate-50 text-slate-700 ring-slate-200",
  "On track": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "At risk": "bg-amber-50 text-amber-700 ring-amber-200",
  "Off track": "bg-rose-50 text-rose-700 ring-rose-200",
  Completed: "bg-sky-50 text-sky-700 ring-sky-200",
};

const progressTone: Record<
  ObjectiveCardData["status"],
  "green" | "amber" | "red" | "blue"
> = {
  "Not started": "blue",
  "On track": "green",
  "At risk": "amber",
  "Off track": "red",
  Completed: "blue",
};

export function ObjectiveCard({
  objective,
  onCheckIn,
  onDelete,
  onEdit,
}: ObjectiveCardProps) {
  return (
    <article className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusStyles[objective.status]}`}
            >
              {objective.status}
            </span>
            <span className="text-xs text-muted-foreground">
              Due {objective.dueDate}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-normal">
            {objective.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {objective.description}
          </p>
          <p className="mt-3 text-sm text-slate-600">
            {objective.team} · {objective.owner}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            type="button"
            onClick={() => onEdit(objective)}
          >
            Edit
          </button>
          <button
            className="rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
            type="button"
            onClick={() => onDelete(objective)}
          >
            Delete
          </button>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            type="button"
            onClick={() => onCheckIn(objective)}
          >
            Check in
          </button>
        </div>
      </div>

      <div className="mt-5">
        <ProgressBar
          value={objective.progress}
          label="Objective progress"
          tone={progressTone[objective.status]}
        />
      </div>

      <div className="mt-5 space-y-3">
        {objective.keyResults.map((keyResult) => (
          <KeyResultRow key={keyResult.id} keyResult={keyResult} />
        ))}
      </div>
    </article>
  );
}
