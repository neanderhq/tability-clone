"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { CheckInModal } from "@/components/check-in-modal";
import { Header } from "@/components/header";
import {
  ObjectiveCard,
  type ObjectiveCardData,
} from "@/components/objective-card";
import { ObjectiveModal } from "@/components/objective-modal";
import { ProgressBar } from "@/components/progress-bar";
import { Sidebar } from "@/components/sidebar";
import type { CycleOption } from "@/components/cycle-selector";
import type { KeyResultRowData } from "@/components/keyresult-row";

type OrganizationResponse = {
  organizations?: OrganizationData[];
};

type OrganizationData = {
  id: string;
  name?: string | null;
};

type CycleResponse = {
  cycles?: ApiCycle[];
};

type ObjectiveResponse = {
  objectives?: ApiObjective[];
};

type ApiCycle = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED";
};

type ApiObjective = {
  id: string;
  title: string;
  description?: string | null;
  status:
    | "NOT_STARTED"
    | "ON_TRACK"
    | "AT_RISK"
    | "OFF_TRACK"
    | "COMPLETED"
    | "ARCHIVED";
  progress?: number | null;
  dueDate?: string | null;
  owner?: {
    name?: string | null;
  } | null;
  workspace?: {
    name?: string | null;
  } | null;
  organization?: {
    name?: string | null;
  } | null;
  keyResults?: ApiKeyResult[];
};

type ApiKeyResult = {
  id: string;
  title: string;
  progress?: number | null;
  currentValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
  owner?: {
    name?: string | null;
  } | null;
};

const cycleStatusLabels: Record<ApiCycle["status"], CycleOption["status"]> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const objectiveStatusLabels: Record<ApiObjective["status"], string> = {
  NOT_STARTED: "Not started",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  COMPLETED: "Completed",
  ARCHIVED: "Completed",
};

const confidenceLabels: Record<
  NonNullable<ApiKeyResult["confidence"]>,
  KeyResultRowData["confidence"]
> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function formatDueDate(dueDate?: string | null) {
  if (!dueDate) {
    return "No date";
  }

  const date = new Date(dueDate);

  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function mapObjective(
  objective: ApiObjective,
  organizationName?: string | null,
): ObjectiveCardData {
  return {
    id: objective.id,
    title: objective.title,
    description: objective.description ?? "",
    owner: objective.owner?.name ?? "Unknown",
    team:
      objective.workspace?.name ??
      objective.organization?.name ??
      organizationName ??
      "Unknown",
    status: objectiveStatusLabels[
      objective.status
    ] as ObjectiveCardData["status"],
    progress: Math.round(objective.progress ?? 0),
    dueDate: formatDueDate(objective.dueDate),
    keyResults:
      objective.keyResults?.map((keyResult) => ({
        id: keyResult.id,
        title: keyResult.title,
        owner: keyResult.owner?.name ?? "Unknown",
        progress: Math.round(keyResult.progress ?? 0),
        currentValue: keyResult.currentValue ?? 0,
        targetValue: keyResult.targetValue ?? 0,
        unit: keyResult.unit ?? undefined,
        confidence: keyResult.confidence
          ? confidenceLabels[keyResult.confidence]
          : "Medium",
      })) ?? [],
  };
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveCardData[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [objectivesLoading, setObjectivesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectiveModalOpen, setObjectiveModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [selectedObjective, setSelectedObjective] =
    useState<ObjectiveCardData | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  const fetchObjectives = useCallback(
    async (organizationData: OrganizationData, cycleId: string) => {
      setObjectivesLoading(true);

      try {
        const params = new URLSearchParams({
          organizationId: organizationData.id,
          cycleId,
        });
        const response = await fetch(`/api/objectives?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load objectives.");
        }

        const data = (await response.json()) as ObjectiveResponse;
        setObjectives(
          (data.objectives ?? []).map((objective) =>
            mapObjective(objective, organizationData.name),
          ),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load objectives.",
        );
        setObjectives([]);
      } finally {
        setObjectivesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      setCycles([]);
      setObjectives([]);
      return;
    }

    let isActive = true;

    async function loadDashboardData() {
      setLoading(true);
      setError(null);

      try {
        const organizationsResponse = await fetch("/api/organizations", {
          cache: "no-store",
        });

        if (!organizationsResponse.ok) {
          throw new Error("Could not load organizations.");
        }

        const organizationsData =
          (await organizationsResponse.json()) as OrganizationResponse;
        const firstOrganization = organizationsData.organizations?.[0] ?? null;

        if (!isActive) {
          return;
        }

        setOrganization(firstOrganization);

        if (!firstOrganization) {
          setCycles([]);
          setObjectives([]);
          return;
        }

        const cyclesResponse = await fetch(
          `/api/cycles?organizationId=${encodeURIComponent(
            firstOrganization.id,
          )}`,
          { cache: "no-store" },
        );

        if (!cyclesResponse.ok) {
          throw new Error("Could not load cycles.");
        }

        const cyclesData = (await cyclesResponse.json()) as CycleResponse;
        const mappedCycles =
          cyclesData.cycles?.map((cycle) => ({
            id: cycle.id,
            name: cycle.name,
            status: cycleStatusLabels[cycle.status],
          })) ?? [];
        const activeCycle =
          mappedCycles.find((cycle) => cycle.status === "Active") ??
          mappedCycles[0];

        if (!isActive) {
          return;
        }

        setCycles(mappedCycles);
        setSelectedCycleId(activeCycle?.id ?? "");

        if (activeCycle) {
          await fetchObjectives(firstOrganization, activeCycle.id);
        } else {
          setObjectives([]);
        }
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load dashboard data.",
        );
        setCycles([]);
        setObjectives([]);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isActive = false;
    };
  }, [fetchObjectives, session?.user, sessionStatus]);

  const selectedCycle = useMemo(
    () => cycles.find((cycle) => cycle.id === selectedCycleId) ?? cycles[0],
    [cycles, selectedCycleId],
  );

  const stats = useMemo(() => {
    const activeObjectives = objectives.filter(
      (objective) => objective.status !== "Completed",
    );
    const averageProgress = objectives.length
      ? Math.round(
          objectives.reduce((total, objective) => total + objective.progress, 0) /
            objectives.length,
        )
      : 0;
    const atRiskCount = objectives.filter(
      (objective) => objective.status === "At risk",
    ).length;
    const checkInsDue = 0;

    return [
      {
        label: "Active objectives",
        value: String(activeObjectives.length),
        change: `${objectives.length} total this cycle`,
      },
      {
        label: "Average progress",
        value: `${averageProgress}%`,
        change: "Across selected objectives",
      },
      {
        label: "Check-ins due",
        value: String(checkInsDue),
        change: "Due count not connected yet",
      },
      {
        label: "At-risk OKRs",
        value: String(atRiskCount),
        change: "In selected cycle",
      },
    ];
  }, [objectives]);

  function openCreateObjective() {
    setSelectedObjective(null);
    setModalMode("create");
    setObjectiveModalOpen(true);
  }

  function openEditObjective(objective: ObjectiveCardData) {
    setSelectedObjective(objective);
    setModalMode("edit");
    setObjectiveModalOpen(true);
  }

  async function handleDeleteObjective(objective: ObjectiveCardData) {
    setError(null);

    const response = await fetch(
      `/api/objectives?id=${encodeURIComponent(objective.id)}`,
      {
        method: "DELETE",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      setError("Could not delete objective.");
      return;
    }

    setObjectives((currentObjectives) =>
      currentObjectives.filter(
        (currentObjective) => currentObjective.id !== objective.id,
      ),
    );
  }

  function openCheckIn(objective?: ObjectiveCardData) {
    setSelectedObjective(objective ?? objectives[0] ?? null);
    setCheckInModalOpen(true);
  }

  async function handleCycleChange(cycleId: string) {
    setSelectedCycleId(cycleId);

    if (organization) {
      setError(null);
      await fetchObjectives(organization, cycleId);
    }
  }

  const onTrackCount = objectives.filter(
    (objective) => objective.status === "On track",
  ).length;
  const atRiskCount = objectives.filter(
    (objective) => objective.status === "At risk",
  ).length;
  const completedCount = objectives.filter(
    (objective) => objective.status === "Completed",
  ).length;
  const averageProgress = objectives.length
    ? Math.round(
        objectives.reduce((total, objective) => total + objective.progress, 0) /
          objectives.length,
      )
    : 0;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <Header
          cycles={cycles}
          selectedCycleId={selectedCycleId}
          onCycleChange={handleCycleChange}
          onCreateObjective={openCreateObjective}
          onOpenCheckIn={() => openCheckIn()}
        />

        <main className="mx-auto grid max-w-7xl gap-6 px-5 pb-24 pt-6 lg:pb-6 xl:grid-cols-[1fr_320px]">
          <section className="min-w-0 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border bg-white p-4 shadow-sm dark:bg-slate-950"
                >
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                  <p className="mt-2 text-xs text-slate-500">{stat.change}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-primary">
                  {selectedCycle?.name ?? "No cycle selected"}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-normal">
                  Recent objectives
                </h2>
              </div>
              <button
                className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                type="button"
                onClick={openCreateObjective}
              >
                Add objective
              </button>
            </div>

            <div className="space-y-4">
              {loading || objectivesLoading ? (
                <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm dark:bg-slate-950">
                  Loading objectives...
                </div>
              ) : error ? (
                <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm dark:bg-slate-950">
                  {error}
                </div>
              ) : objectives.length ? (
                objectives.map((objective) => (
                  <ObjectiveCard
                    key={objective.id}
                    objective={objective}
                    onCheckIn={openCheckIn}
                    onDelete={handleDeleteObjective}
                    onEdit={openEditObjective}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm dark:bg-slate-950">
                  No objectives found for this cycle.
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-lg border border-border bg-white p-5 shadow-sm dark:bg-slate-950">
              <h2 className="text-base font-semibold tracking-normal">
                Quick actions
              </h2>
              <div className="mt-4 grid gap-2">
                <button
                  className="rounded-md bg-primary px-3 py-2 text-left text-sm font-semibold text-primary-foreground hover:opacity-90"
                  type="button"
                  onClick={openCreateObjective}
                >
                  Create objective
                </button>
                <button
                  className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                  type="button"
                  onClick={() => openCheckIn()}
                >
                  Draft AI check-in
                </button>
                <button
                  className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                  type="button"
                >
                  Review at-risk OKRs
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold tracking-normal">
                  Cycle health
                </h2>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  {selectedCycle?.status ?? "No cycle"}
                </span>
              </div>
              <div className="mt-5 space-y-5">
                <ProgressBar
                  value={averageProgress}
                  label="Overall progress"
                />
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">On track</span>
                    <span className="font-medium">
                      {onTrackCount} objectives
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">At risk</span>
                    <span className="font-medium">
                      {atRiskCount} objectives
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium">
                      {completedCount} objectives
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </main>
      </div>

      <ObjectiveModal
        open={objectiveModalOpen}
        mode={modalMode}
        objective={selectedObjective}
        cycles={cycles}
        onClose={() => setObjectiveModalOpen(false)}
      />
      <CheckInModal
        open={checkInModalOpen}
        objective={selectedObjective}
        onClose={() => setCheckInModalOpen(false)}
      />
    </div>
  );
}
