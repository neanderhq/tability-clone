"use client";

import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Sidebar } from "@/components/sidebar";

type OrganizationData = {
  id: string;
  name?: string | null;
};

type OrganizationResponse = {
  organizations?: OrganizationData[];
};

type CycleResponse = {
  cycles?: ApiCycle[];
};

type CycleItemResponse = {
  cycle?: ApiCycle;
};

type ApiCycle = {
  id: string;
  name: string;
  slug?: string | null;
  status: "PLANNED" | "ACTIVE" | "CLOSED";
  startsAt: string;
  endsAt: string;
  organizationId?: string;
  workspaceId?: string | null;
  workspace?: {
    name?: string | null;
  } | null;
  _count?: {
    objectives?: number;
  };
};

type CycleFormState = {
  name: string;
  status: ApiCycle["status"];
  startsAt: string;
  endsAt: string;
};

const emptyForm: CycleFormState = {
  name: "",
  status: "PLANNED",
  startsAt: "",
  endsAt: "",
};

const statusLabels: Record<ApiCycle["status"], string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const statusStyles: Record<ApiCycle["status"], string> = {
  PLANNED: "bg-slate-50 text-slate-700 ring-slate-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-sky-50 text-sky-700 ring-sky-200",
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildCyclePayload(form: CycleFormState, organizationId: string) {
  return {
    name: form.name.trim(),
    status: form.status,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    organizationId,
  };
}

export default function CyclesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [cycles, setCycles] = useState<ApiCycle[]>([]);
  const [form, setForm] = useState<CycleFormState>(emptyForm);
  const [editForm, setEditForm] = useState<CycleFormState>(emptyForm);
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCycleId, setSavingCycleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCycles = useCallback(async (organizationId: string) => {
    const params = new URLSearchParams({ organizationId });
    const response = await fetch(`/api/cycles?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load cycles.");
    }

    const data = (await response.json()) as CycleResponse;
    setCycles(data.cycles ?? []);
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      setOrganization(null);
      setCycles([]);
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
          setCycles([]);
          return;
        }

        await loadCycles(firstOrganization.id);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load cycles.",
        );
        setCycles([]);
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
  }, [loadCycles, session?.user, sessionStatus]);

  const cycleStats = useMemo(() => {
    const activeCount = cycles.filter((cycle) => cycle.status === "ACTIVE").length;
    const plannedCount = cycles.filter(
      (cycle) => cycle.status === "PLANNED",
    ).length;
    const closedCount = cycles.filter((cycle) => cycle.status === "CLOSED").length;

    return [
      {
        label: "Total cycles",
        value: String(cycles.length),
        note: organization?.name ?? "Current workspace",
      },
      {
        label: "Active",
        value: String(activeCount),
        note: "Current planning window",
      },
      {
        label: "Planned",
        value: String(plannedCount),
        note: "Upcoming cycles",
      },
      {
        label: "Closed",
        value: String(closedCount),
        note: "Completed cycles",
      },
    ];
  }, [cycles, organization?.name]);

  function updateForm(field: keyof CycleFormState, value: string) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function updateEditForm(field: keyof CycleFormState, value: string) {
    setEditForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function startEditingCycle(cycle: ApiCycle) {
    setEditingCycleId(cycle.id);
    setEditForm({
      name: cycle.name,
      status: cycle.status,
      startsAt: toDateInputValue(cycle.startsAt),
      endsAt: toDateInputValue(cycle.endsAt),
    });
    setError(null);
  }

  function cancelEditingCycle() {
    setEditingCycleId(null);
    setEditForm(emptyForm);
  }

  async function updateCycle(
    cycleId: string,
    data: Partial<CycleFormState> & { slug?: string },
  ) {
    const response = await fetch("/api/cycles", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: cycleId,
        ...data,
      }),
    });

    if (!response.ok) {
      throw new Error("Could not update cycle.");
    }

    return response.json() as Promise<CycleItemResponse>;
  }

  async function handleSaveCycle(cycle: ApiCycle) {
    if (!organization) {
      setError("Create an organization before updating cycles.");
      return;
    }

    if (!editForm.name.trim() || !editForm.startsAt || !editForm.endsAt) {
      setError("Add a cycle name, start date, and end date.");
      return;
    }

    setSavingCycleId(cycle.id);
    setError(null);

    try {
      if (editForm.status === "ACTIVE") {
        const otherActiveCycles = cycles.filter(
          (currentCycle) =>
            currentCycle.status === "ACTIVE" && currentCycle.id !== cycle.id,
        );

        await Promise.all(
          otherActiveCycles.map((currentCycle) =>
            updateCycle(currentCycle.id, { status: "PLANNED" }),
          ),
        );
      }

      await updateCycle(cycle.id, {
        name: editForm.name.trim(),
        status: editForm.status,
        startsAt: editForm.startsAt,
        endsAt: editForm.endsAt,
      });
      await loadCycles(organization.id);
      cancelEditingCycle();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update cycle.",
      );
    } finally {
      setSavingCycleId(null);
    }
  }

  async function handleCloseCycle(cycle: ApiCycle) {
    if (!organization) {
      setError("Create an organization before updating cycles.");
      return;
    }

    setSavingCycleId(cycle.id);
    setError(null);

    try {
      await updateCycle(cycle.id, { status: "CLOSED" });
      await loadCycles(organization.id);

      if (editingCycleId === cycle.id) {
        cancelEditingCycle();
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not close cycle.",
      );
    } finally {
      setSavingCycleId(null);
    }
  }

  async function handleSwitchActiveCycle(cycle: ApiCycle) {
    if (!organization) {
      setError("Create an organization before updating cycles.");
      return;
    }

    setSavingCycleId(cycle.id);
    setError(null);

    try {
      const otherActiveCycles = cycles.filter(
        (currentCycle) =>
          currentCycle.status === "ACTIVE" && currentCycle.id !== cycle.id,
      );

      await Promise.all([
        updateCycle(cycle.id, { status: "ACTIVE" }),
        ...otherActiveCycles.map((currentCycle) =>
          updateCycle(currentCycle.id, { status: "PLANNED" }),
        ),
      ]);
      await loadCycles(organization.id);

      if (editingCycleId === cycle.id) {
        cancelEditingCycle();
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not switch active cycle.",
      );
    } finally {
      setSavingCycleId(null);
    }
  }

  async function handleDuplicateCycle(cycle: ApiCycle) {
    if (!organization) {
      setError("Create an organization before duplicating cycles.");
      return;
    }

    const name = `Copy of ${cycle.name}`;

    setSavingCycleId(cycle.id);
    setError(null);

    try {
      const response = await fetch("/api/cycles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug: `${slugify(name)}-${Date.now()}`,
          status: "PLANNED",
          startsAt: toDateInputValue(cycle.startsAt),
          endsAt: toDateInputValue(cycle.endsAt),
          organizationId: cycle.organizationId ?? organization.id,
          workspaceId: cycle.workspaceId ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not duplicate cycle.");
      }

      await loadCycles(organization.id);
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error
          ? duplicateError.message
          : "Could not duplicate cycle.",
      );
    } finally {
      setSavingCycleId(null);
    }
  }

  async function handleCreateCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      setError("Create an organization before adding cycles.");
      return;
    }

    if (!form.name.trim() || !form.startsAt || !form.endsAt) {
      setError("Add a cycle name, start date, and end date.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/cycles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildCyclePayload(form, organization.id)),
      });

      if (!response.ok) {
        throw new Error("Could not create cycle.");
      }

      await loadCycles(organization.id);
      setForm(emptyForm);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create cycle.",
      );
    } finally {
      setSaving(false);
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
                Cycles
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
                <p className="text-sm font-medium text-primary">New cycle</p>
                <h2 className="mt-1 text-lg font-semibold tracking-normal">
                  Cycle details
                </h2>
              </div>

              <form className="mt-5 grid gap-4" onSubmit={handleCreateCycle}>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Name</span>
                  <input
                    className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    disabled={saving || !organization}
                    name="name"
                    placeholder="Q4 2026"
                    required
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Status</span>
                  <select
                    className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    disabled={saving || !organization}
                    name="status"
                    value={form.status}
                    onChange={(event) =>
                      updateForm("status", event.target.value)
                    }
                  >
                    {Object.entries(statusLabels).map(([status, label]) => (
                      <option key={status} value={status}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Start date</span>
                    <input
                      className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      disabled={saving || !organization}
                      name="startsAt"
                      required
                      type="date"
                      value={form.startsAt}
                      onChange={(event) =>
                        updateForm("startsAt", event.target.value)
                      }
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">End date</span>
                    <input
                      className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      disabled={saving || !organization}
                      name="endsAt"
                      required
                      type="date"
                      value={form.endsAt}
                      onChange={(event) =>
                        updateForm("endsAt", event.target.value)
                      }
                    />
                  </label>
                </div>

                <button
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    saving ||
                    !organization ||
                    !form.name.trim() ||
                    !form.startsAt ||
                    !form.endsAt
                  }
                  type="submit"
                >
                  {saving ? "Saving..." : "Create cycle"}
                </button>
              </form>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {cycleStats.map((stat) => (
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
                Loading cycles...
              </div>
            ) : !session?.user ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  Sign in to view cycles
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Cycles are connected to your workspace account.
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
                  Create or join an organization before adding cycles.
                </p>
              </div>
            ) : cycles.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  No cycles yet
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add your first cycle to start planning objectives.
                </p>
              </div>
            ) : (
              cycles.map((cycle) => {
                const isEditing = editingCycleId === cycle.id;
                const isCycleSaving = savingCycleId === cycle.id;
                const objectiveCount = cycle._count?.objectives ?? 0;
                const visibleStatus = isEditing ? editForm.status : cycle.status;

                return (
                  <article
                    key={cycle.id}
                    className="rounded-lg border border-border bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusStyles[visibleStatus]}`}
                          >
                            {statusLabels[visibleStatus]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {isEditing
                              ? `${formatDate(editForm.startsAt)} - ${formatDate(
                                  editForm.endsAt,
                                )}`
                              : `${formatDate(cycle.startsAt)} - ${formatDate(
                                  cycle.endsAt,
                                )}`}
                          </span>
                        </div>

                        {isEditing ? (
                          <div className="mt-4 grid gap-4">
                            <label className="grid gap-2">
                              <span className="text-sm font-medium">Name</span>
                              <input
                                className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                disabled={isCycleSaving}
                                value={editForm.name}
                                onChange={(event) =>
                                  updateEditForm("name", event.target.value)
                                }
                              />
                            </label>

                            <div className="grid gap-4 md:grid-cols-3">
                              <label className="grid gap-2">
                                <span className="text-sm font-medium">Status</span>
                                <select
                                  className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                  disabled={isCycleSaving}
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
                                  Start date
                                </span>
                                <input
                                  className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                  disabled={isCycleSaving}
                                  type="date"
                                  value={editForm.startsAt}
                                  onChange={(event) =>
                                    updateEditForm("startsAt", event.target.value)
                                  }
                                />
                              </label>

                              <label className="grid gap-2">
                                <span className="text-sm font-medium">End date</span>
                                <input
                                  className="rounded-md border border-border bg-transparent px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                  disabled={isCycleSaving}
                                  type="date"
                                  value={editForm.endsAt}
                                  onChange={(event) =>
                                    updateEditForm("endsAt", event.target.value)
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h2 className="mt-3 text-lg font-semibold tracking-normal">
                              {cycle.name}
                            </h2>

                            <p className="mt-3 text-sm text-slate-600">
                              {cycle.workspace?.name ??
                                organization.name ??
                                "Workspace"}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="grid gap-3 sm:min-w-52">
                        <div className="rounded-md bg-slate-50 p-3 text-sm">
                          <p className="text-muted-foreground">Objectives</p>
                          <p className="mt-1 text-xl font-semibold">
                            {objectiveCount}
                          </p>
                        </div>

                        {isEditing ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                isCycleSaving ||
                                !editForm.name.trim() ||
                                !editForm.startsAt ||
                                !editForm.endsAt
                              }
                              type="button"
                              onClick={() => handleSaveCycle(cycle)}
                            >
                              {isCycleSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isCycleSaving}
                              type="button"
                              onClick={cancelEditingCycle}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            <button
                              className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isCycleSaving}
                              type="button"
                              onClick={() => startEditingCycle(cycle)}
                            >
                              Edit cycle
                            </button>
                            <button
                              className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isCycleSaving || cycle.status === "ACTIVE"}
                              type="button"
                              onClick={() => handleSwitchActiveCycle(cycle)}
                            >
                              {isCycleSaving ? "Updating..." : "Make active"}
                            </button>
                            <button
                              className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isCycleSaving || cycle.status === "CLOSED"}
                              type="button"
                              onClick={() => handleCloseCycle(cycle)}
                            >
                              Close cycle
                            </button>
                            <button
                              className="rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isCycleSaving}
                              type="button"
                              onClick={() => handleDuplicateCycle(cycle)}
                            >
                              Duplicate cycle
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
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
