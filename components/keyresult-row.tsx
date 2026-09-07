import { ProgressBar } from "@/components/progress-bar";

export type KeyResultRowData = {
  id: string;
  title: string;
  owner: string;
  progress: number;
  currentValue: number;
  targetValue: number;
  unit?: string;
  confidence: "High" | "Medium" | "Low";
};

type KeyResultRowProps = {
  keyResult: KeyResultRowData;
};

const confidenceStyles = {
  High: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function KeyResultRow({ keyResult }: KeyResultRowProps) {
  const valueLabel = `${keyResult.currentValue}${keyResult.unit ?? ""} / ${
    keyResult.targetValue
  }${keyResult.unit ?? ""}`;

  return (
    <div className="grid gap-3 rounded-md border border-border bg-slate-50 p-3 dark:bg-slate-900 md:grid-cols-[1fr_160px_88px] md:items-center">
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
    </div>
  );
}
