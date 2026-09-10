"use client";

import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { CheckInModal } from "@/components/check-in-modal";
import { type ObjectiveCardData } from "@/components/objective-card";
import { ProgressBar } from "@/components/progress-bar";
import { Sidebar } from "@/components/sidebar";

type OrganizationData = {
  id: string;
  name?: string | null;
};

type OrganizationResponse = {
  organizations?: OrganizationData[];
};

type ObjectiveResponse = {
  objectives?: ApiObjective[];
};

type CheckInResponse = {
  checkIns?: ApiCheckIn[];
};

type CheckInItemResponse = {
  checkIn?: ApiCheckIn;
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
    email?: string | null;
  } | null;
  workspace?: {
    name?: string | null;
  } | null;
  organization?: {
    name?: string | null;
  } | null;
  keyResults?: unknown[];
};

type ApiCheckIn = {
  id: string;
  note?: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  progress?: number | null;
  value?: number | null;
  createdAt?: string | null;
  author?: {
    name?: string | null;
    email?: string | null;
  } | null;
  objective?: {
    id: string;
    title: string;
  } | null;
  keyResult?: {
    title?: string | null;
  } | null;
};

type CheckInFormData = {
  note: string;
  confidence: string;
  progress: number;
  value: number;
  organizationId: string;
  objectiveId: string;
};

type ObjectiveWithCheckInDefaults = ObjectiveCardData & {
  organizationId: string;
  confidence?: string;
};

const confidenceLabels: Record<ApiCheckIn["confidence"], string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const confidenceStyles: Record<ApiCheckIn["confidence"], string> = {
  HIGH: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  LOW: "bg-rose-50 text-rose-700 ring-rose-200",
};

const confidenceTone: Record<
  ApiCheckIn["confidence"],
  "green" | "amber" | "red"
> = {
  HIGH: "green",
  MEDIUM: "amber",
  LOW: "red",
};

function formatDate(dateValue?: string | null) {
  if (!dateValue) {
    return "No date";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function mapObjectiveForModal(
  objective: ApiObjective,
  organization: OrganizationData,
): ObjectiveWithCheckInDefaults {
  return {
    id: objective.id,
    title: objective.title,
    description: objective.description ?? "",
    owner:
      objective.owner?.name ?? objective.owner?.email ?? "Unassigned",
    team:
      objective.workspace?.name ??
      objective.organization?.name ??
      organization.name ??
      "Workspace",
    status:
      objective.status === "COMPLETED"
        ? "Completed"
        : objective.status === "AT_RISK"
          ? "At risk"
          : objective.status === "OFF_TRACK"
            ? "Off track"
            : objective.status === "ON_TRACK"
              ? "On track"
              : "Not started",
    progress: Math.round(objective.progress ?? 0),
    dueDate: formatDate(objective.dueDate),
    keyResults: [],
    organizationId: organization.id,
  };
}

export default function CheckInsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [objectives, setObjectives] = useState<ApiObjective[]>([]);
  const [checkIns, setCheckIns] = useState<ApiCheckIn[]>([]);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [autoOpenedReminderModal, setAutoOpenedReminderModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCheckIns = useCallback(async (organizationId: string) => {
    const params = new URLSearchParams({ organizationId });
    const response = await fetch(`/api/checkins?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load check-ins.");
    }

    const data = (await response.json()) as CheckInResponse;
    setCheckIns(data.checkIns ?? []);
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      setOrganization(null);
      setObjectives([]);
      setCheckIns([]);
      return;
    }

    let isActive = true;

    async function loadPageData() {
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
          setObjectives([]);
          setCheckIns([]);
          return;
        }

        const params = new URLSearchParams({
          organizationId: firstOrganization.id,
        });
        const [objectivesResponse, checkInsResponse] = await Promise.all([
          fetch(`/api/objectives?${params.toString()}`, { cache: "no-store" }),
          fetch(`/api/checkins?${params.toString()}`, { cache: "no-store" }),
        ]);

        if (!objectivesResponse.ok) {
          throw new Error("Could not load objectives.");
        }

        if (!checkInsResponse.ok) {
          throw new Error("Could not load check-ins.");
        }

        const objectivesData =
          (await objectivesResponse.json()) as ObjectiveResponse;
        const checkInsData = (await checkInsResponse.json()) as CheckInResponse;
        const loadedObjectives = objectivesData.objectives ?? [];

        if (!isActive) {
          return;
        }

        setObjectives(loadedObjectives);
        setCheckIns(checkInsData.checkIns ?? []);
        setSelectedObjectiveId((currentObjectiveId) =>
          currentObjectiveId ||
          loadedObjectives[0]?.id ||
          "",
        );
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load check-ins.",
        );
        setObjectives([]);
        setCheckIns([]);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadPageData();

    return () => {
      isActive = false;
    };
  }, [loadCheckIns, session?.user, sessionStatus]);

  const selectedObjective = useMemo(() => {
    if (!organization) {
      return null;
    }

    const objective = objectives.find(
      (currentObjective) => currentObjective.id === selectedObjectiveId,
    );

    return objective ? mapObjectiveForModal(objective, organization) : null;
  }, [objectives, organization, selectedObjectiveId]);

  useEffect(() => {
    const shouldOpenWeeklyModal = searchParams.get("modal") === "weekly";

    if (
      shouldOpenWeeklyModal &&
      !autoOpenedReminderModal &&
      selectedObjective
    ) {
      setModalOpen(true);
      setAutoOpenedReminderModal(true);
    }
  }, [autoOpenedReminderModal, searchParams, selectedObjective]);

  const checkInStats = useMemo(() => {
    const highCount = checkIns.filter(
      (checkIn) => checkIn.confidence === "HIGH",
    ).length;
    const mediumCount = checkIns.filter(
      (checkIn) => checkIn.confidence === "MEDIUM",
    ).length;
    const lowCount = checkIns.filter(
      (checkIn) => checkIn.confidence === "LOW",
    ).length;

    return [
      {
        label: "Total check-ins",
        value: String(checkIns.length),
        note: organization?.name ?? "Current workspace",
      },
      {
        label: "High confidence",
        value: String(highCount),
        note: "Moving well",
      },
      {
        label: "Medium confidence",
        value: String(mediumCount),
        note: "Needs watching",
      },
      {
        label: "Low confidence",
        value: String(lowCount),
        note: "Needs attention",
      },
    ];
  }, [checkIns, organization?.name]);

  async function handleSubmitCheckIn(data: CheckInFormData) {
    if (!organization || !data.objectiveId) {
      setError("Select an objective before saving a check-in.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: data.note,
          confidence: data.confidence,
          progress: data.progress,
          value: data.value,
          organizationId: organization.id,
          objectiveId: data.objectiveId,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not create check-in.");
      }

      const responseData = (await response.json()) as CheckInItemResponse;

      if (responseData.checkIn) {
        setCheckIns((currentCheckIns) => [
          responseData.checkIn as ApiCheckIn,
          ...currentCheckIns,
        ]);
      } else {
        await loadCheckIns(organization.id);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not create check-in.",
      );
      throw saveError;
    } finally {
      setSaving(false);
    }
  }

  function openModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedObjective) {
      setError("Select an objective before creating a check-in.");
      return;
    }

    setError(null);
    setModalOpen(true);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {session?.user?.email ?? "Workspace"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                Check-ins
              </h1>
            </div>

            {!session?.user && sessionStatus !== "loading" ? (
              <button
                className="w-fit rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                type="button"
                onClick={() => signIn()}
              >
                Sign in
              </button>
            ) : null}
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-6 px-5 pb-24 pt-6 lg:pb-6 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-medium text-primary">
                  New check-in
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-normal">
                  Select objective
                </h2>
              </div>

              <form className="mt-5 grid gap-4" onSubmit={openModal}>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Objective</span>
                  <select
                    className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    disabled={loading || saving || objectives.length === 0}
                    name="objectiveId"
                    value={selectedObjectiveId}
                    onChange={(event) =>
                      setSelectedObjectiveId(event.target.value)
                    }
                  >
                    <option value="">Select objective</option>
                    {objectives.map((objective) => (
                      <option key={objective.id} value={objective.id}>
                        {objective.title}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedObjective ? (
                  <div className="rounded-md bg-slate-50 p-3 text-sm">
                    <p className="font-medium">{selectedObjective.title}</p>
                    <p className="mt-1 text-muted-foreground">
                      {selectedObjective.team} · {selectedObjective.progress}%
                    </p>
                  </div>
                ) : null}

                <button
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || saving || !selectedObjective}
                  type="submit"
                >
                  Create check-in
                </button>
              </form>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {checkInStats.map((stat) => (
                <section
                  key={stat.label}
                  className="rounded-lg border border-border bg-white p-4 shadow-sm"
                >
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                  <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
                </section>
              ))}
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            {loading || sessionStatus === "loading" ? (
              <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground shadow-sm">
                Loading check-ins...
              </div>
            ) : !session?.user ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  Sign in to view check-ins
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Check-ins are connected to your workspace account.
                </p>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-white p-6 text-sm text-rose-700 shadow-sm">
                {error}
              </div>
            ) : !organization ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  No organization found
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create or join an organization before adding check-ins.
                </p>
              </div>
            ) : objectives.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  No objectives found
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add an objective before creating check-ins.
                </p>
              </div>
            ) : checkIns.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  No check-ins yet
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create the first check-in for one of your objectives.
                </p>
              </div>
            ) : (
              checkIns.map((checkIn) => {
                const confidence = checkIn.confidence;
                const progress = Math.round(checkIn.progress ?? 0);
                const author =
                  checkIn.author?.name ?? checkIn.author?.email ?? "Unknown";

                return (
                  <article
                    key={checkIn.id}
                    className="rounded-lg border border-border bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${confidenceStyles[confidence]}`}
                          >
                            {confidenceLabels[confidence]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(checkIn.createdAt)}
                          </span>
                        </div>

                        <h2 className="mt-3 text-lg font-semibold tracking-normal">
                          {checkIn.objective?.title ?? "Objective update"}
                        </h2>

                        {checkIn.note ? (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {checkIn.note}
                          </p>
                        ) : (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                            No note added.
                          </p>
                        )}

                        <p className="mt-3 text-sm text-slate-600">
                          {author}
                          {checkIn.keyResult?.title
                            ? ` · ${checkIn.keyResult.title}`
                            : ""}
                        </p>
                      </div>

                      <div className="rounded-md bg-slate-50 p-3 text-sm">
                        <p className="text-muted-foreground">Value</p>
                        <p className="mt-1 text-xl font-semibold">
                          {checkIn.value ?? progress}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <ProgressBar
                        value={progress}
                        label="Reported progress"
                        tone={confidenceTone[confidence]}
                      />
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </main>
      </div>

      <CheckInModal
        open={modalOpen}
        objective={selectedObjective}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitCheckIn}
      />
    </div>
  );
}
