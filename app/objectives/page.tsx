"use client";

import { signIn, useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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

type ObjectiveItemResponse = {
  objective?: ApiObjective;
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
  visibility?: "PUBLIC" | "PRIVATE";
  level?: "COMPANY" | "TEAM" | "INDIVIDUAL";
  progress?: number | null;
  dueDate?: string | null;
  updatedAt?: string | null;
  owner?: {
    name?: string | null;
    email?: string | null;
  } | null;
  workspace?: {
    name?: string | null;
  } | null;
  cycle?: {
    name?: string | null;
  } | null;
  keyResults?: unknown[];
};

type ObjectiveFormState = {
  title: string;
  description: string;
  status: ApiObjective["status"];
  visibility: NonNullable<ApiObjective["visibility"]>;
  progress: string;
  dueDate: string;
};

const emptyForm: ObjectiveFormState = {
  title: "",
  description: "",
  status: "NOT_STARTED",
  visibility: "PUBLIC",
  progress: "0",
  dueDate: "",
};

const statusLabels: Record<ApiObjective["status"], string> = {
  NOT_STARTED: "Not started",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const statusStyles: Record<ApiObjective["status"], string> = {
  NOT_STARTED: "bg-slate-50 text-slate-700 ring-slate-200",
  ON_TRACK: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  AT_RISK: "bg-amber-50 text-amber-700 ring-amber-200",
  OFF_TRACK: "bg-rose-50 text-rose-700 ring-rose-200",
  COMPLETED: "bg-sky-50 text-sky-700 ring-sky-200",
  ARCHIVED: "bg-slate-100 text-slate-600 ring-slate-200",
};

const visibilityLabels: Record<NonNullable<ApiObjective["visibility"]>, string> =
  {
    PUBLIC: "Public",
    PRIVATE: "Private",
  };

const visibilityStyles: Record<NonNullable<ApiObjective["visibility"]>, string> =
  {
    PUBLIC: "bg-sky-50 text-sky-700 ring-sky-200",
    PRIVATE: "bg-violet-50 text-violet-700 ring-violet-200",
  };

const progressTone: Record<
  ApiObjective["status"],
  "green" | "amber" | "red" | "blue"
> = {
  NOT_STARTED: "blue",
  ON_TRACK: "green",
  AT_RISK: "amber",
  OFF_TRACK: "red",
  COMPLETED: "blue",
  ARCHIVED: "blue",
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

function toDateInputValue(dateValue?: string | null) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function buildCreateObjectivePayload(
  form: ObjectiveFormState,
  organizationId: string,
) {
  const progress = Number(form.progress);

  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    level: "TEAM" as const,
    status: form.status,
    visibility: form.visibility,
    progress: Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : 0,
    dueDate: form.dueDate || undefined,
    organizationId,
  };
}

function buildUpdateObjectivePayload(form: ObjectiveFormState) {
  const progress = Number(form.progress);

  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    status: form.status,
    visibility: form.visibility,
    progress: Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : 0,
    dueDate: form.dueDate || undefined,
  };
}

function formFromObjective(objective: ApiObjective): ObjectiveFormState {
  return {
    title: objective.title,
    description: objective.description ?? "",
    status: objective.status,
    visibility: objective.visibility ?? "PUBLIC",
    progress: String(Math.round(objective.progress ?? 0)),
    dueDate: toDateInputValue(objective.dueDate),
  };
}

export default function ObjectivesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [objectives, setObjectives] = useState<ApiObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ObjectiveFormState>(emptyForm);
  const [editForm, setEditForm] = useState<ObjectiveFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const loadObjectives = useCallback(async (organizationId: string) => {
    const params = new URLSearchParams({ organizationId });
    const response = await fetch(`/api/objectives?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load objectives.");
    }

    const data = (await response.json()) as ObjectiveResponse;
    setObjectives(data.objectives ?? []);
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      setOrganization(null);
      setObjectives([]);
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
          return;
        }

        await loadObjectives(firstOrganization.id);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load objectives.",
        );
        setObjectives([]);
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
  }, [loadObjectives, session?.user, sessionStatus]);

  const objectiveStats = useMemo(() => {
    const activeCount = objectives.filter(
      (objective) =>
        objective.status !== "COMPLETED" && objective.status !== "ARCHIVED",
    ).length;
    const atRiskCount = objectives.filter(
      (objective) => objective.status === "AT_RISK",
    ).length;
    const averageProgress = objectives.length
      ? Math.round(
          objectives.reduce(
            (total, objective) => total + (objective.progress ?? 0),
            0,
          ) / objectives.length,
        )
      : 0;

    return [
      {
        label: "Total objectives",
        value: String(objectives.length),
        note: organization?.name ?? "Current workspace",
      },
      {
        label: "Active objectives",
        value: String(activeCount),
        note: "Open work in progress",
      },
      {
        label: "Average progress",
        value: `${averageProgress}%`,
        note: "Across all objectives",
      },
      {
        label: "At risk",
        value: String(atRiskCount),
        note: "Needs attention",
      },
    ];
  }, [objectives, organization?.name]);

  function updateCreateForm(field: keyof ObjectiveFormState, value: string) {
    setCreateForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function updateEditForm(field: keyof ObjectiveFormState, value: string) {
    setEditForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  async function handleCreateObjective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      setError("Create an organization before adding objectives.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/objectives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildCreateObjectivePayload(createForm, organization.id),
        ),
      });

      if (!response.ok) {
        throw new Error("Could not create objective.");
      }

      const data = (await response.json()) as ObjectiveItemResponse;

      if (data.objective) {
        setObjectives((currentObjectives) => [
          data.objective as ApiObjective,
          ...currentObjectives,
        ]);
      } else {
        await loadObjectives(organization.id);
      }

      setCreateForm(emptyForm);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create objective.",
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditing(objective: ApiObjective) {
    setEditingId(objective.id);
    setEditForm(formFromObjective(objective));
    setError(null);
  }

  async function handleUpdateObjective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !editingId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/objectives", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          ...buildUpdateObjectivePayload(editForm),
        }),
      });

      if (!response.ok) {
        throw new Error("Could not update objective.");
      }

      const data = (await response.json()) as ObjectiveItemResponse;

      if (data.objective) {
        setObjectives((currentObjectives) =>
          currentObjectives.map((objective) =>
            objective.id === editingId
              ? (data.objective as ApiObjective)
              : objective,
          ),
        );
      } else {
        await loadObjectives(organization.id);
      }

      setEditingId(null);
      setEditForm(emptyForm);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update objective.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteObjective(objectiveId: string) {
    setDeletingId(objectiveId);
    setError(null);

    try {
      const response = await fetch(
        `/api/objectives?id=${encodeURIComponent(objectiveId)}`,
        {
          method: "DELETE",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Could not delete objective.");
      }

      setObjectives((currentObjectives) =>
        currentObjectives.filter((objective) => objective.id !== objectiveId),
      );

      if (editingId === objectiveId) {
        setEditingId(null);
        setEditForm(emptyForm);
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete objective.",
      );
    } finally {
      setDeletingId(null);
    }
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
                Objectives
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
                  New objective
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-normal">
                  Objective details
                </h2>
              </div>

              <form className="mt-5 grid gap-4" onSubmit={handleCreateObjective}>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Title</span>
                  <input
                    className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    disabled={saving || !organization}
                    name="title"
                    placeholder="Improve activation this quarter"
                    required
                    value={createForm.title}
                    onChange={(event) =>
                      updateCreateForm("title", event.target.value)
                    }
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Description</span>
                  <textarea
                    className="min-h-24 rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    disabled={saving || !organization}
                    name="description"
                    placeholder="What outcome should the team create?"
                    value={createForm.description}
                    onChange={(event) =>
                      updateCreateForm("description", event.target.value)
                    }
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Status</span>
                    <select
                      className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      disabled={saving || !organization}
                      name="status"
                      value={createForm.status}
                      onChange={(event) =>
                        updateCreateForm("status", event.target.value)
                      }
                    >
                      {Object.entries(statusLabels).map(([status, label]) => (
                        <option key={status} value={status}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Visibility</span>
                    <select
                      className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      disabled={saving || !organization}
                      name="visibility"
                      value={createForm.visibility}
                      onChange={(event) =>
                        updateCreateForm("visibility", event.target.value)
                      }
                    >
                      {Object.entries(visibilityLabels).map(
                        ([visibility, label]) => (
                          <option key={visibility} value={visibility}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Progress</span>
                    <input
                      className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      disabled={saving || !organization}
                      max="100"
                      min="0"
                      name="progress"
                      type="number"
                      value={createForm.progress}
                      onChange={(event) =>
                        updateCreateForm("progress", event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Due date</span>
                  <input
                    className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    disabled={saving || !organization}
                    name="dueDate"
                    type="date"
                    value={createForm.dueDate}
                    onChange={(event) =>
                      updateCreateForm("dueDate", event.target.value)
                    }
                  />
                </label>

                <button
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving || !organization || !createForm.title.trim()}
                  type="submit"
                >
                  {saving ? "Saving..." : "Create objective"}
                </button>
              </form>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {objectiveStats.map((stat) => (
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
                Loading objectives...
              </div>
            ) : !session?.user ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  Sign in to view objectives
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Objectives are connected to your workspace account.
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
                  Create or join an organization before adding objectives.
                </p>
              </div>
            ) : objectives.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  No objectives yet
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add your first objective to start tracking progress.
                </p>
              </div>
            ) : (
              objectives.map((objective) => {
                const owner =
                  objective.owner?.name ?? objective.owner?.email ?? "Unassigned";
                const group =
                  objective.workspace?.name ??
                  objective.cycle?.name ??
                  organization.name ??
                  "Workspace";
                const progress = Math.round(objective.progress ?? 0);
                const isEditing = editingId === objective.id;

                return (
                  <article
                    key={objective.id}
                    className="rounded-lg border border-border bg-white p-5 shadow-sm"
                  >
                    {isEditing ? (
                      <form className="grid gap-4" onSubmit={handleUpdateObjective}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-primary">
                              Edit objective
                            </p>
                            <h2 className="mt-1 text-lg font-semibold tracking-normal">
                              Update details
                            </h2>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                              disabled={saving}
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(emptyForm);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={saving || !editForm.title.trim()}
                              type="submit"
                            >
                              {saving ? "Saving..." : "Save changes"}
                            </button>
                          </div>
                        </div>

                        <label className="grid gap-2">
                          <span className="text-sm font-medium">Title</span>
                          <input
                            className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                            name="title"
                            required
                            value={editForm.title}
                            onChange={(event) =>
                              updateEditForm("title", event.target.value)
                            }
                          />
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm font-medium">Description</span>
                          <textarea
                            className="min-h-24 rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                            name="description"
                            value={editForm.description}
                            onChange={(event) =>
                              updateEditForm("description", event.target.value)
                            }
                          />
                        </label>

                        <div className="grid gap-4 md:grid-cols-4">
                          <label className="grid gap-2">
                            <span className="text-sm font-medium">Status</span>
                            <select
                              className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              name="status"
                              value={editForm.status}
                              onChange={(event) =>
                                updateEditForm("status", event.target.value)
                              }
                            >
                              {Object.entries(statusLabels).map(
                                ([status, label]) => (
                                  <option key={status} value={status}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          <label className="grid gap-2">
                            <span className="text-sm font-medium">
                              Visibility
                            </span>
                            <select
                              className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              name="visibility"
                              value={editForm.visibility}
                              onChange={(event) =>
                                updateEditForm("visibility", event.target.value)
                              }
                            >
                              {Object.entries(visibilityLabels).map(
                                ([visibility, label]) => (
                                  <option key={visibility} value={visibility}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          <label className="grid gap-2">
                            <span className="text-sm font-medium">Progress</span>
                            <input
                              className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              max="100"
                              min="0"
                              name="progress"
                              type="number"
                              value={editForm.progress}
                              onChange={(event) =>
                                updateEditForm("progress", event.target.value)
                              }
                            />
                          </label>

                          <label className="grid gap-2">
                            <span className="text-sm font-medium">Due date</span>
                            <input
                              className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              name="dueDate"
                              type="date"
                              value={editForm.dueDate}
                              onChange={(event) =>
                                updateEditForm("dueDate", event.target.value)
                              }
                            />
                          </label>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusStyles[objective.status]}`}
                              >
                                {statusLabels[objective.status]}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                                  visibilityStyles[
                                    objective.visibility ?? "PUBLIC"
                                  ]
                                }`}
                              >
                                {
                                  visibilityLabels[
                                    objective.visibility ?? "PUBLIC"
                                  ]
                                }
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Due {formatDate(objective.dueDate)}
                              </span>
                              {objective.updatedAt ? (
                                <span className="text-xs text-muted-foreground">
                                  Updated {formatDate(objective.updatedAt)}
                                </span>
                              ) : null}
                            </div>

                            <h2 className="mt-3 text-lg font-semibold tracking-normal">
                              {objective.title}
                            </h2>

                            {objective.description ? (
                              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                                {objective.description}
                              </p>
                            ) : null}

                            <p className="mt-3 text-sm text-slate-600">
                              {group} · {owner}
                            </p>
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <button
                              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                              type="button"
                              onClick={() => startEditing(objective)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={deletingId === objective.id}
                              type="button"
                              onClick={() => handleDeleteObjective(objective.id)}
                            >
                              {deletingId === objective.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-5">
                          <ProgressBar
                            value={progress}
                            label="Objective progress"
                            tone={progressTone[objective.status]}
                          />
                        </div>

                        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                          <div className="rounded-md bg-slate-50 p-3">
                            <p className="text-muted-foreground">Key results</p>
                            <p className="mt-1 font-medium">
                              {objective.keyResults?.length ?? 0}
                            </p>
                          </div>
                          <div className="rounded-md bg-slate-50 p-3">
                            <p className="text-muted-foreground">Level</p>
                            <p className="mt-1 font-medium">
                              {objective.level
                                ? objective.level.toLowerCase()
                                : "team"}
                            </p>
                          </div>
                          <div className="rounded-md bg-slate-50 p-3">
                            <p className="text-muted-foreground">Visibility</p>
                            <p className="mt-1 font-medium">
                              {
                                visibilityLabels[
                                  objective.visibility ?? "PUBLIC"
                                ]
                              }
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
