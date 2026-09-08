type ProgressTone = "green" | "amber" | "red" | "blue";

type ProgressBarProps = {
  value: number;
  label?: string;
  tone?: ProgressTone;
  size?: "sm" | "md";
};

const toneClasses: Record<ProgressTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-sky-500",
};

export function ProgressBar({
  value,
  label,
  tone = "green",
  size = "md",
}: ProgressBarProps) {
  const normalizedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="space-y-2">
      {label ? (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            {label}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {Math.round(normalizedValue)}%
          </span>
        </div>
      ) : null}
      <div
        className={`w-full overflow-hidden rounded-full bg-muted ${
          size === "sm" ? "h-2" : "h-3"
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedValue}
      >
        <div
          className={`h-full rounded-full ${toneClasses[tone]}`}
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
    </div>
  );
}
