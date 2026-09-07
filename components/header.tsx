"use client";

import { signOut, useSession } from "next-auth/react";
import { CycleSelector, type CycleOption } from "@/components/cycle-selector";

type HeaderProps = {
  cycles: CycleOption[];
  selectedCycleId: string;
  onCycleChange: (cycleId: string) => void;
  onCreateObjective: () => void;
  onOpenCheckIn: () => void;
};

export function Header({
  cycles,
  selectedCycleId,
  onCycleChange,
  onCreateObjective,
  onOpenCheckIn,
}: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {session?.user?.email ?? "Workspace"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">
            Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CycleSelector
            cycles={cycles}
            selectedCycleId={selectedCycleId}
            onChange={onCycleChange}
          />
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            type="button"
            onClick={onOpenCheckIn}
          >
            AI check-in
          </button>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            type="button"
            onClick={onCreateObjective}
          >
            New objective
          </button>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            type="button"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
