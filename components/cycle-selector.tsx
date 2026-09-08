"use client";

export type CycleOption = {
  id: string;
  name: string;
  status: "Active" | "Planned" | "Closed";
};

type CycleSelectorProps = {
  cycles: CycleOption[];
  selectedCycleId: string;
  onChange: (cycleId: string) => void;
};

export function CycleSelector({
  cycles,
  selectedCycleId,
  onChange,
}: CycleSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Cycle</span>
      <select
        className="h-10 min-w-44 rounded-md border border-border bg-white px-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        value={selectedCycleId}
        onChange={(event) => onChange(event.target.value)}
      >
        {cycles.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.name} · {cycle.status}
          </option>
        ))}
      </select>
    </label>
  );
}
