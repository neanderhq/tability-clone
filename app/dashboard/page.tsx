"use client";

import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
import type {
  KeyResultRowData,
  KeyResultUpdateData,
} from "@/components/keyresult-row";

type OrganizationResponse = {
  organizations?: OrganizationData[];
};

type OrganizationItemResponse = {
  organization?: OrganizationData | null;
};

type OrganizationRole = "ADMIN" | "MEMBER";

type OrganizationMember = {
  id: string;
  email: string;
  name?: string | null;
  role: OrganizationRole;
};

type WorkspaceOption = {
  id: string;
  name: string;
};

type OrganizationData = {
  id: string;
  name?: string | null;
  currentUserRole?: OrganizationRole;
  members?: OrganizationMember[];
  workspaces?: WorkspaceOption[];
};

type CycleResponse = {
  cycles?: ApiCycle[];
};

type ObjectiveResponse = {
  objectives?: ApiObjective[];
};

type MetricResponse = {
  metrics?: ApiMetric[];
};

type ReminderResponse = {
  counts?: {
    objectives?: number;
    keyResults?: number;
    metrics?: number;
  };
  statusUpdated?: boolean;
  slack?: {
    posted?: number;
    failed?: number;
    skipped?: string;
  };
};

type ApiCycle = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED";
};

type DashboardTab = "OKRS" | "KPIS";

type CheckInCadence = "NONE" | "WEEKLY";

type ApiObjective = {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
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
  checkInCadence?: CheckInCadence | null;
  lastCheckInReminderAt?: string | null;
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
  type?: "NUMBER" | "PERCENTAGE" | "CURRENCY" | "BOOLEAN" | null;
  startValue?: number | null;
  currentValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
  checkInCadence?: CheckInCadence | null;
  lastCheckInReminderAt?: string | null;
  owner?: {
    name?: string | null;
  } | null;
  githubIntegration?: ApiKeyResult["gitHubIntegration"];
  gitHubIntegration?: {
    repository: string;
    branch?: string | null;
    incrementBy?: number | null;
  } | null;
};

type ApiMetric = {
  id: string;
  title: string;
  description?: string | null;
  type: "NUMBER" | "PERCENTAGE" | "CURRENCY";
  currentValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
  checkInCadence?: CheckInCadence | null;
  lastCheckInReminderAt?: string | null;
  updatedAt?: string | null;
  owner?: {
    name?: string | null;
  } | null;
  workspace?: {
    name?: string | null;
  } | null;
};

type MetricFormState = {
  title: string;
  type: ApiMetric["type"];
  currentValue: string;
  targetValue: string;
  unit: string;
};

type InviteFormState = {
  email: string;
  name: string;
  workspaceId: string;
  role: OrganizationRole;
};

const emptyMetricForm: MetricFormState = {
  title: "",
  type: "NUMBER",
  currentValue: "0",
  targetValue: "",
  unit: "",
};

const emptyInviteForm: InviteFormState = {
  email: "",
  name: "",
  workspaceId: "",
  role: "MEMBER",
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

const apiConfidenceLabels: Record<
  KeyResultRowData["confidence"],
  NonNullable<ApiKeyResult["confidence"]>
> = {
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
};

const metricTypeLabels: Record<ApiMetric["type"], string> = {
  NUMBER: "Number",
  PERCENTAGE: "Percentage",
  CURRENCY: "Currency",
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

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function calculateKeyResultProgress(keyResult: ApiKeyResult) {
  const startValue = keyResult.startValue ?? 0;
  const currentValue = keyResult.currentValue ?? 0;
  const targetValue = keyResult.targetValue ?? 0;

  if (keyResult.type === "BOOLEAN") {
    return currentValue >= targetValue ? 100 : 0;
  }

  const totalChange = targetValue - startValue;

  if (totalChange === 0) {
    return currentValue >= targetValue ? 100 : 0;
  }

  return clampProgress(((currentValue - startValue) / totalChange) * 100);
}

function isWeeklyReminderDue(
  checkInCadence?: CheckInCadence | null,
  lastCheckInReminderAt?: string | null,
) {
  if (checkInCadence !== "WEEKLY") {
    return false;
  }

  if (!lastCheckInReminderAt) {
    return true;
  }

  const reminderDate = new Date(lastCheckInReminderAt);

  if (Number.isNaN(reminderDate.getTime())) {
    return true;
  }

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return reminderDate.getTime() <= oneWeekAgo;
}

function countDueOkrReminders(objectives: ApiObjective[]) {
  return objectives.reduce((total, objective) => {
    if (objective.status === "COMPLETED" || objective.status === "ARCHIVED") {
      return total;
    }

    const objectiveDue = isWeeklyReminderDue(
      objective.checkInCadence,
      objective.lastCheckInReminderAt,
    )
      ? 1
      : 0;
    const keyResultsDue =
      objective.keyResults?.filter((keyResult) =>
        isWeeklyReminderDue(
          keyResult.checkInCadence,
          keyResult.lastCheckInReminderAt,
        ),
      ).length ?? 0;

    return total + objectiveDue + keyResultsDue;
  }, 0);
}

function metricProgress(metric: ApiMetric) {
  if (!metric.targetValue) {
    return null;
  }

  return clampProgress(((metric.currentValue ?? 0) / metric.targetValue) * 100);
}

function formatMetricValue(metric: ApiMetric) {
  const value = metric.currentValue ?? 0;

  if (metric.type === "PERCENTAGE") {
    return `${Math.round(value)}%`;
  }

  if (metric.type === "CURRENCY") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: metric.unit || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return `${value.toLocaleString()}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatMetricTarget(metric: ApiMetric) {
  if (metric.targetValue === null || metric.targetValue === undefined) {
    return "No target";
  }

  return formatMetricValue({
    ...metric,
    currentValue: metric.targetValue,
  });
}

function calculateObjectiveStatus(
  keyResults: KeyResultRowData[],
  fallbackStatus: ApiObjective["status"],
): ObjectiveCardData["status"] {
  if (!keyResults.length) {
    return objectiveStatusLabels[
      fallbackStatus
    ] as ObjectiveCardData["status"];
  }

  const averageProgress = Math.round(
    keyResults.reduce((total, keyResult) => total + keyResult.progress, 0) /
      keyResults.length,
  );
  const hasLowConfidence = keyResults.some(
    (keyResult) => keyResult.confidence === "Low",
  );
  const hasMediumConfidence = keyResults.some(
    (keyResult) => keyResult.confidence === "Medium",
  );

  if (keyResults.every((keyResult) => keyResult.progress >= 100)) {
    return "Completed";
  }

  if (averageProgress <= 0) {
    return "Not started";
  }

  if (hasLowConfidence && averageProgress < 50) {
    return "Off track";
  }

  if (averageProgress < 50) {
    return "At risk";
  }

  if (hasLowConfidence || (hasMediumConfidence && averageProgress < 60)) {
    return "At risk";
  }

  return "On track";
}

function mapObjective(
  objective: ApiObjective,
  organizationName?: string | null,
): ObjectiveCardData {
  const keyResults =
    objective.keyResults?.map((keyResult) => ({
      id: keyResult.id,
      title: keyResult.title,
      owner: keyResult.owner?.name ?? "Unknown",
      progress: calculateKeyResultProgress(keyResult),
      currentValue: keyResult.currentValue ?? 0,
      targetValue: keyResult.targetValue ?? 0,
      unit: keyResult.unit ?? undefined,
      confidence: keyResult.confidence
        ? confidenceLabels[keyResult.confidence]
        : "Medium",
      gitHubIntegration:
        keyResult.githubIntegration ?? keyResult.gitHubIntegration ?? null,
    })) ?? [];
  const progress = keyResults.length
    ? Math.round(
        keyResults.reduce((total, keyResult) => total + keyResult.progress, 0) /
          keyResults.length,
      )
    : Math.round(objective.progress ?? 0);

  return {
    id: objective.id,
    organizationId: objective.organizationId,
    workspaceId: objective.workspaceId ?? undefined,
    title: objective.title,
    description: objective.description ?? "",
    owner: objective.owner?.name ?? "Unknown",
    team:
      objective.workspace?.name ??
      objective.organization?.name ??
      organizationName ??
      "Unknown",
    status: calculateObjectiveStatus(keyResults, objective.status),
    progress,
    dueDate: formatDueDate(objective.dueDate),
    keyResults,
  };
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<DashboardTab>("OKRS");
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveCardData[]>([]);
  const [metrics, setMetrics] = useState<ApiMetric[]>([]);
  const [objectiveSearch, setObjectiveSearch] = useState("");
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [objectivesLoading, setObjectivesLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricSaving, setMetricSaving] = useState(false);
  const [metricForm, setMetricForm] = useState<MetricFormState>(emptyMetricForm);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(emptyInviteForm);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const [organizationStatus, setOrganizationStatus] = useState<string | null>(
    null,
  );
  const [okrReminderCount, setOkrReminderCount] = useState(0);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objectiveModalOpen, setObjectiveModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [selectedObjective, setSelectedObjective] =
    useState<ObjectiveCardData | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  const applyOrganization = useCallback(
    (organizationData: OrganizationData | null) => {
      setOrganization(organizationData);
      setInviteForm((current) => ({
        ...current,
        workspaceId:
          current.workspaceId || organizationData?.workspaces?.[0]?.id || "",
      }));
    },
    [],
  );

  const openCreateObjective = useCallback(() => {
    setSelectedObjective(null);
    setModalMode("create");
    setObjectiveModalOpen(true);
  }, []);

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
        const objectiveData = data.objectives ?? [];

        setOkrReminderCount(countDueOkrReminders(objectiveData));
        setObjectives(
          objectiveData.map((objective) =>
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
        setOkrReminderCount(0);
      } finally {
        setObjectivesLoading(false);
      }
    },
    [],
  );

  const fetchMetrics = useCallback(async (organizationId: string) => {
    setMetricsLoading(true);

    try {
      const params = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/metrics?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load KPIs.");
      }

      const data = (await response.json()) as MetricResponse;
      setMetrics(data.metrics ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load KPIs.",
      );
      setMetrics([]);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      applyOrganization(null);
      setCycles([]);
      setObjectives([]);
      setMetrics([]);
      setOkrReminderCount(0);
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

        applyOrganization(firstOrganization);

        if (!firstOrganization) {
          setCycles([]);
          setObjectives([]);
          setMetrics([]);
          setOkrReminderCount(0);
          return;
        }

        await fetchMetrics(firstOrganization.id);

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
          setOkrReminderCount(0);
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
        setMetrics([]);
        setOkrReminderCount(0);
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
  }, [
    applyOrganization,
    fetchMetrics,
    fetchObjectives,
    session?.user,
    sessionStatus,
  ]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCreateObjective();
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [openCreateObjective]);

  const selectedCycle = useMemo(
    () => cycles.find((cycle) => cycle.id === selectedCycleId) ?? cycles[0],
    [cycles, selectedCycleId],
  );

  const filteredObjectives = useMemo(() => {
    const normalizedSearch = objectiveSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return objectives;
    }

    return objectives.filter((objective) =>
      objective.title.toLowerCase().includes(normalizedSearch),
    );
  }, [objectiveSearch, objectives]);

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
        value: String(okrReminderCount),
        change: "Weekly reminders ready",
      },
      {
        label: "At-risk OKRs",
        value: String(atRiskCount),
        change: "In selected cycle",
      },
    ];
  }, [objectives, okrReminderCount]);

  const metricReminderCount = useMemo(
    () =>
      metrics.filter((metric) =>
        isWeeklyReminderDue(
          metric.checkInCadence,
          metric.lastCheckInReminderAt,
        ),
      ).length,
    [metrics],
  );

  const kpiStats = useMemo(() => {
    const metricsWithTargets = metrics.filter(
      (metric) => metric.targetValue !== null && metric.targetValue !== undefined,
    );
    const averageTargetProgress = metricsWithTargets.length
      ? Math.round(
          metricsWithTargets.reduce(
            (total, metric) => total + (metricProgress(metric) ?? 0),
            0,
          ) / metricsWithTargets.length,
        )
      : 0;
    const currencyMetrics = metrics.filter(
      (metric) => metric.type === "CURRENCY",
    ).length;

    return [
      {
        label: "Ongoing KPIs",
        value: String(metrics.length),
        change: "Not tied to cycles",
      },
      {
        label: "Target attainment",
        value: `${averageTargetProgress}%`,
        change: `${metricsWithTargets.length} with targets`,
      },
      {
        label: "Reminder due",
        value: String(metricReminderCount),
        change: "Weekly KPI check-ins",
      },
      {
        label: "Currency metrics",
        value: String(currencyMetrics),
        change: "Tracked separately",
      },
    ];
  }, [metricReminderCount, metrics]);

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

  async function handleKeyResultEdit(
    keyResult: KeyResultRowData,
    updates: KeyResultUpdateData,
  ) {
    setError(null);

    const response = await fetch("/api/keyresults", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        id: keyResult.id,
        currentValue: updates.currentValue,
        confidence: apiConfidenceLabels[updates.confidence],
        gitHubIntegration: updates.gitHubIntegration,
      }),
    });

    if (!response.ok) {
      setError("Could not update key result.");
      throw new Error("Could not update key result.");
    }

    if (organization && selectedCycleId) {
      await fetchObjectives(organization, selectedCycleId);
    }
  }

  async function handleCreateMetric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      setError("Create or join an organization before adding KPIs.");
      return;
    }

    const currentValue = Number(metricForm.currentValue);
    const targetValue = Number(metricForm.targetValue);

    setMetricSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          title: metricForm.title.trim(),
          type: metricForm.type,
          currentValue: Number.isFinite(currentValue) ? currentValue : 0,
          targetValue:
            metricForm.targetValue.trim() && Number.isFinite(targetValue)
              ? targetValue
              : undefined,
          unit: metricForm.unit.trim() || undefined,
          organizationId: organization.id,
          checkInCadence: "WEEKLY",
        }),
      });

      if (!response.ok) {
        throw new Error("Could not create KPI.");
      }

      setMetricForm(emptyMetricForm);
      await fetchMetrics(organization.id);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not create KPI.",
      );
    } finally {
      setMetricSaving(false);
    }
  }

  async function handleTriggerWeeklyReminders() {
    if (!organization) {
      setReminderStatus("Create or join an organization first.");
      return;
    }

    setReminderStatus("Triggering weekly reminders...");
    setError(null);

    try {
      const response = await fetch("/api/checkins/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          organizationId: organization.id,
          scope: activeTab === "KPIS" ? "KPIS" : "OKRS",
        }),
      });

      if (!response.ok) {
        throw new Error("Could not trigger reminders.");
      }

      const data = (await response.json()) as ReminderResponse;
      const remindedCount =
        activeTab === "KPIS"
          ? data.counts?.metrics ?? 0
          : (data.counts?.objectives ?? 0) + (data.counts?.keyResults ?? 0);

      const slackFailureCount = data.slack?.failed ?? 0;
      const slackPostCount = data.slack?.posted ?? 0;

      setReminderStatus(
        data.slack?.skipped
          ? "Slack is not connected to a reminder channel yet."
          : slackFailureCount > 0
            ? `Could not post ${slackFailureCount} Slack reminder${slackFailureCount === 1 ? "" : "s"}.`
            : slackPostCount > 0
              ? `Posted ${remindedCount} weekly reminder${remindedCount === 1 ? "" : "s"} to Slack.`
              : remindedCount
                ? `Triggered ${remindedCount} weekly reminders.`
                : "No weekly reminders were due.",
      );

      if (activeTab === "KPIS") {
        await fetchMetrics(organization.id);
      } else if (selectedCycleId) {
        await fetchObjectives(organization, selectedCycleId);
      }
    } catch (reminderError) {
      setReminderStatus(
        reminderError instanceof Error
          ? reminderError.message
          : "Could not trigger reminders.",
      );
    }
  }

  function handleConnectSlack() {
    if (!organization) {
      setReminderStatus("Create or join an organization first.");
      return;
    }

    const params = new URLSearchParams({
      organizationId: organization.id,
    });

    if (inviteForm.workspaceId) {
      params.set("workspaceId", inviteForm.workspaceId);
    }

    window.location.href = `/api/checkins/slack?${params.toString()}`;
  }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      setOrganizationStatus("Create or join an organization first.");
      return;
    }

    if (!inviteForm.workspaceId) {
      setOrganizationStatus("Select a workspace before inviting a user.");
      return;
    }

    setInviteSaving(true);
    setOrganizationStatus(null);

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          organizationId: organization.id,
          workspaceId: inviteForm.workspaceId,
          email: inviteForm.email.trim(),
          name: inviteForm.name.trim() || undefined,
          role: inviteForm.role,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not invite user.");
      }

      const data = (await response.json()) as OrganizationItemResponse;

      if (data.organization) {
        applyOrganization(data.organization);
      }

      setInviteForm((current) => ({
        ...emptyInviteForm,
        workspaceId:
          data.organization?.workspaces?.[0]?.id || current.workspaceId,
      }));
      setOrganizationStatus("User added to the workspace.");
    } catch (inviteError) {
      setOrganizationStatus(
        inviteError instanceof Error
          ? inviteError.message
          : "Could not invite user.",
      );
    } finally {
      setInviteSaving(false);
    }
  }

  async function handleMemberRoleChange(
    member: OrganizationMember,
    role: OrganizationRole,
  ) {
    if (!organization || member.role === role) {
      return;
    }

    setRoleSavingId(member.id);
    setOrganizationStatus(null);

    try {
      const response = await fetch("/api/organizations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          organizationId: organization.id,
          userId: member.id,
          role,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not update role.");
      }

      const data = (await response.json()) as OrganizationItemResponse;

      if (data.organization) {
        applyOrganization(data.organization);
      }

      setOrganizationStatus("Role updated.");
    } catch (roleError) {
      setOrganizationStatus(
        roleError instanceof Error ? roleError.message : "Could not update role.",
      );
    } finally {
      setRoleSavingId(null);
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
  const isOrganizationAdmin = organization?.currentUserRole === "ADMIN";
  const organizationMembers = organization?.members ?? [];
  const workspaceOptions = organization?.workspaces ?? [];

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
            <div className="flex w-fit rounded-lg border border-border bg-white p-1 shadow-sm">
              {(["OKRS", "KPIS"] as DashboardTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-slate-600 hover:bg-muted"
                  }`}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "OKRS" ? "OKRs" : "KPIs"}
                </button>
              ))}
            </div>

            {activeTab === "OKRS" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-border bg-white p-4 shadow-sm"
                    >
                      <p className="text-sm text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">
                        {stat.value}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {stat.change}
                      </p>
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
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor="objective-search">
                      Search objectives
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-64"
                      id="objective-search"
                      placeholder="Filter objectives by title"
                      type="search"
                      value={objectiveSearch}
                      onChange={(event) =>
                        setObjectiveSearch(event.target.value)
                      }
                    />
                    <button
                      className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                      type="button"
                      onClick={openCreateObjective}
                    >
                      Add objective
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {loading || objectivesLoading ? (
                    <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
                      Loading objectives...
                    </div>
                  ) : error ? (
                    <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
                      {error}
                    </div>
                  ) : filteredObjectives.length ? (
                    filteredObjectives.map((objective) => (
                      <ObjectiveCard
                        key={objective.id}
                        objective={objective}
                        onCheckIn={openCheckIn}
                        onDelete={handleDeleteObjective}
                        onEdit={openEditObjective}
                        onKeyResultEdit={handleKeyResultEdit}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
                      {objectiveSearch.trim()
                        ? "No objectives match this search."
                        : "No objectives found for this cycle."}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {kpiStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-border bg-white p-4 shadow-sm"
                    >
                      <p className="text-sm text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">
                        {stat.value}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {stat.change}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-medium text-primary">
                    Ongoing metrics
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-normal">
                    KPIs
                  </h2>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {loading || metricsLoading ? (
                    <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
                      Loading KPIs...
                    </div>
                  ) : error ? (
                    <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
                      {error}
                    </div>
                  ) : metrics.length ? (
                    metrics.map((metric) => {
                      const progress = metricProgress(metric);

                      return (
                        <article
                          key={metric.id}
                          className="rounded-lg border border-border bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-primary">
                                {metricTypeLabels[metric.type]}
                              </p>
                              <h3 className="mt-1 text-base font-semibold tracking-normal">
                                {metric.title}
                              </h3>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {metric.workspace?.name ??
                                  organization?.name ??
                                  "Workspace"}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                              Weekly
                            </span>
                          </div>

                          <div className="mt-5">
                            <p className="text-3xl font-semibold">
                              {formatMetricValue(metric)}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Target: {formatMetricTarget(metric)}
                            </p>
                          </div>

                          {progress !== null ? (
                            <div className="mt-4">
                              <ProgressBar value={progress} size="sm" />
                            </div>
                          ) : null}

                          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                            <span>{metric.owner?.name ?? "Unassigned"}</span>
                            <span>
                              {isWeeklyReminderDue(
                                metric.checkInCadence,
                                metric.lastCheckInReminderAt,
                              )
                                ? "Reminder due"
                                : "Reminder current"}
                            </span>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
                      No KPIs found yet.
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold tracking-normal">
                Quick actions
              </h2>
              <div className="mt-4 grid gap-2">
                {activeTab === "OKRS" ? (
                  <>
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
                  </>
                ) : null}
                <button
                  className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${
                    activeTab === "KPIS"
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border border-border hover:bg-muted"
                  }`}
                  type="button"
                  onClick={handleTriggerWeeklyReminders}
                >
                  Trigger weekly reminders
                </button>
                {isOrganizationAdmin ? (
                  <button
                    className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                    type="button"
                    onClick={handleConnectSlack}
                  >
                    Connect Slack
                  </button>
                ) : null}
              </div>
              {reminderStatus ? (
                <p className="mt-3 text-xs text-slate-500">{reminderStatus}</p>
              ) : null}
            </section>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-normal">
                  Organization access
                </h2>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ring-1 ${
                    isOrganizationAdmin
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-slate-50 text-slate-600 ring-slate-200"
                  }`}
                >
                  {isOrganizationAdmin ? "Admin" : "Member"}
                </span>
              </div>

              {isOrganizationAdmin ? (
                <div className="mt-4 space-y-5">
                  <form className="grid gap-3" onSubmit={handleInviteUser}>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Email</span>
                      <input
                        className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        required
                        type="email"
                        value={inviteForm.email}
                        onChange={(event) =>
                          setInviteForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Name</span>
                      <input
                        className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={inviteForm.name}
                        onChange={(event) =>
                          setInviteForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">
                        Workspace
                      </span>
                      <select
                        className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        required
                        value={inviteForm.workspaceId}
                        onChange={(event) =>
                          setInviteForm((current) => ({
                            ...current,
                            workspaceId: event.target.value,
                          }))
                        }
                      >
                        <option value="" disabled>
                          Select workspace
                        </option>
                        {workspaceOptions.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Role</span>
                      <select
                        className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={inviteForm.role}
                        onChange={(event) =>
                          setInviteForm((current) => ({
                            ...current,
                            role: event.target.value as OrganizationRole,
                          }))
                        }
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <button
                      className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={inviteSaving || !inviteForm.email.trim()}
                      type="submit"
                    >
                      {inviteSaving ? "Inviting..." : "Invite user"}
                    </button>
                  </form>

                  <div className="space-y-2">
                    {organizationMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.name ?? member.email}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                        <select
                          className="rounded-md border border-border px-2 py-1 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          disabled={roleSavingId === member.id}
                          value={member.role}
                          onChange={(event) =>
                            handleMemberRoleChange(
                              member,
                              event.target.value as OrganizationRole,
                            )
                          }
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Admins manage workspace invites and member roles.
                </p>
              )}

              {organizationStatus ? (
                <p className="mt-3 text-xs text-slate-500">
                  {organizationStatus}
                </p>
              ) : null}
            </section>

            {activeTab === "OKRS" ? (
              <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
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
            ) : (
              <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold tracking-normal">
                  Add KPI
                </h2>
                <form className="mt-4 grid gap-3" onSubmit={handleCreateMetric}>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Name</span>
                    <input
                      className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      required
                      value={metricForm.title}
                      onChange={(event) =>
                        setMetricForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Type</span>
                    <select
                      className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      value={metricForm.type}
                      onChange={(event) =>
                        setMetricForm((current) => ({
                          ...current,
                          type: event.target.value as ApiMetric["type"],
                        }))
                      }
                    >
                      <option value="NUMBER">Number</option>
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="CURRENCY">Currency</option>
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">
                        Current
                      </span>
                      <input
                        className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        type="number"
                        value={metricForm.currentValue}
                        onChange={(event) =>
                          setMetricForm((current) => ({
                            ...current,
                            currentValue: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Target</span>
                      <input
                        className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        type="number"
                        value={metricForm.targetValue}
                        onChange={(event) =>
                          setMetricForm((current) => ({
                            ...current,
                            targetValue: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Unit</span>
                    <input
                      className="rounded-md border border-border px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder={metricForm.type === "CURRENCY" ? "USD" : ""}
                      value={metricForm.unit}
                      onChange={(event) =>
                        setMetricForm((current) => ({
                          ...current,
                          unit: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={metricSaving || !metricForm.title.trim()}
                    type="submit"
                  >
                    {metricSaving ? "Saving..." : "Create KPI"}
                  </button>
                </form>
              </section>
            )}
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
