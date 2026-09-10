"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type ApiObjective = {
  id: string;
  title: string;
  description?: string | null;
  level?: "COMPANY" | "TEAM" | "INDIVIDUAL";
  status:
    | "NOT_STARTED"
    | "ON_TRACK"
    | "AT_RISK"
    | "OFF_TRACK"
    | "COMPLETED"
    | "ARCHIVED";
  progress?: number | null;
  parentObjectiveId?: string | null;
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

type ObjectiveNode = ApiObjective & {
  children: ObjectiveNode[];
};

const levelLabels: Record<NonNullable<ApiObjective["level"]>, string> = {
  COMPANY: "Company",
  TEAM: "Team",
  INDIVIDUAL: "Individual",
};

const levelOrder: Record<NonNullable<ApiObjective["level"]>, number> = {
  COMPANY: 0,
  TEAM: 1,
  INDIVIDUAL: 2,
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

function getObjectiveLevel(objective: ApiObjective) {
  return objective.level ?? "TEAM";
}

function getProgress(objective: ApiObjective) {
  return Math.max(0, Math.min(100, Math.round(objective.progress ?? 0)));
}

function sortObjectives(first: ObjectiveNode, second: ObjectiveNode) {
  const firstLevel = getObjectiveLevel(first);
  const secondLevel = getObjectiveLevel(second);
  const levelComparison = levelOrder[firstLevel] - levelOrder[secondLevel];

  if (levelComparison !== 0) {
    return levelComparison;
  }

  return first.title.localeCompare(second.title);
}

function sortTree(nodes: ObjectiveNode[]) {
  nodes.sort(sortObjectives);
  nodes.forEach((node) => sortTree(node.children));

  return nodes;
}

function buildObjectiveTree(objectives: ApiObjective[]) {
  const nodesById = new Map<string, ObjectiveNode>();

  objectives.forEach((objective) => {
    nodesById.set(objective.id, {
      ...objective,
      children: [],
    });
  });

  const roots: ObjectiveNode[] = [];

  nodesById.forEach((node) => {
    const parent = node.parentObjectiveId
      ? nodesById.get(node.parentObjectiveId)
      : null;

    if (parent) {
      parent.children.push(node);
      return;
    }

    roots.push(node);
  });

  return sortTree(roots);
}

function countObjectivesByLevel(objectives: ApiObjective[]) {
  return objectives.reduce(
    (counts, objective) => {
      counts[getObjectiveLevel(objective)] += 1;
      return counts;
    },
    {
      COMPANY: 0,
      TEAM: 0,
      INDIVIDUAL: 0,
    },
  );
}

function ObjectiveTreeNode({ node }: { node: ObjectiveNode }) {
  const level = getObjectiveLevel(node);
  const progress = getProgress(node);
  const owner = node.owner?.name ?? node.owner?.email ?? "Unassigned";
  const context = node.workspace?.name ?? node.cycle?.name ?? "Workspace";

  return (
    <li>
      <article className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                {levelLabels[level]}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusStyles[node.status]}`}
              >
                {statusLabels[node.status]}
              </span>
            </div>

            <h2 className="mt-3 text-lg font-semibold tracking-normal">
              {node.title}
            </h2>
            {node.description ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {node.description}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-slate-600">
              {context} · {owner}
            </p>
          </div>

          <div className="grid gap-3 sm:min-w-52">
            <ProgressBar
              value={progress}
              label={`${progress}% progress`}
              tone={progressTone[node.status]}
            />
            <Link
              className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:bg-muted"
              href={`/objectives?objectiveId=${encodeURIComponent(node.id)}`}
            >
              View objective
            </Link>
          </div>
        </div>
      </article>

      {node.children.length ? (
        <ul className="ml-4 mt-3 space-y-3 border-l border-border pl-4">
          {node.children.map((childNode) => (
            <ObjectiveTreeNode key={childNode.id} node={childNode} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function AlignmentPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [objectives, setObjectives] = useState<ApiObjective[]>([]);
  const [loading, setLoading] = useState(true);
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
            : "Could not load alignment.",
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

  const objectiveTree = useMemo(() => buildObjectiveTree(objectives), [objectives]);
  const levelCounts = useMemo(
    () => countObjectivesByLevel(objectives),
    [objectives],
  );
  const averageProgress = useMemo(
    () =>
      objectives.length
        ? Math.round(
            objectives.reduce(
              (total, objective) => total + getProgress(objective),
              0,
            ) / objectives.length,
          )
        : 0,
    [objectives],
  );

  const stats = [
    {
      label: "Company",
      value: String(levelCounts.COMPANY),
      note: "Top-level goals",
    },
    {
      label: "Team",
      value: String(levelCounts.TEAM),
      note: "Supporting objectives",
    },
    {
      label: "Individual",
      value: String(levelCounts.INDIVIDUAL),
      note: "Personal ownership",
    },
    {
      label: "Average progress",
      value: `${averageProgress}%`,
      note: organization?.name ?? "Current workspace",
    },
  ];

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
                Alignment
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

        <main className="mx-auto grid max-w-7xl gap-6 px-5 pb-24 pt-6 lg:pb-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-white p-4 shadow-sm"
              >
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
              </div>
            ))}
          </section>

          <section className="min-w-0 space-y-4">
            <div>
              <p className="text-sm font-medium text-primary">
                {organization?.name ?? "Organization"}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                Objective hierarchy
              </h2>
            </div>

            {loading || sessionStatus === "loading" ? (
              <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground shadow-sm">
                Loading alignment...
              </div>
            ) : !session?.user ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  Sign in to view alignment
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Objective hierarchy is connected to your workspace account.
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
                  Create or join an organization before reviewing alignment.
                </p>
              </div>
            ) : objectiveTree.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-normal">
                  No objectives yet
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add objectives and connect parent objectives to see the tree.
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {objectiveTree.map((node) => (
                  <ObjectiveTreeNode key={node.id} node={node} />
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
