"use client";

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

type KeyResultResponse = {
  keyResults?: ApiKeyResult[];
};

type ApiObjective = {
  id: string;
  title: string;
  status:
    | "NOT_STARTED"
    | "ON_TRACK"
    | "AT_RISK"
    | "OFF_TRACK"
    | "COMPLETED"
    | "ARCHIVED";
  progress?: number | null;
  workspace?: {
    name?: string | null;
  } | null;
  organization?: {
    name?: string | null;
  } | null;
  keyResults?: {
    id: string;
  }[];
};

type ApiKeyResult = {
  id: string;
  title: string;
  type: "NUMBER" | "PERCENTAGE" | "CURRENCY" | "BOOLEAN";
  startValue?: number | null;
  targetValue?: number | null;
  currentValue?: number | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
  workspace?: {
    name?: string | null;
  } | null;
  objective?: {
    id: string;
    title?: string | null;
    workspace?: {
      name?: string | null;
    } | null;
  } | null;
};

type TeamRollup = {
  team: string;
  objectiveCount: number;
  completedCount: number;
  atRiskCount: number;
  keyResultCount: number;
  averageProgress: number;
  completionRate: number;
  averageConfidenceScore: number;
  averageConfidenceLabel: string;
};

const keyResultTypeLabels: Record<ApiKeyResult["type"], string> = {
  NUMBER: "Number",
  PERCENTAGE: "Percentage",
  CURRENCY: "Currency",
  BOOLEAN: "Boolean",
};

const confidenceScores: Record<NonNullable<ApiKeyResult["confidence"]>, number> =
  {
    HIGH: 100,
    MEDIUM: 60,
    LOW: 30,
  };

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getTeamName(
  organization: OrganizationData | null,
  workspaceName?: string | null,
  organizationName?: string | null,
) {
  return workspaceName ?? organizationName ?? organization?.name ?? "Workspace";
}

function confidenceLabel(score: number, count: number) {
  if (count === 0) {
    return "No confidence data";
  }

  if (score >= 80) {
    return "High";
  }

  if (score >= 45) {
    return "Medium";
  }

  return "Low";
}

function keyResultProgress(keyResult: ApiKeyResult) {
  const startValue = keyResult.startValue ?? 0;
  const currentValue = keyResult.currentValue ?? 0;
  const targetValue = keyResult.targetValue ?? 0;
  const range = targetValue - startValue;

  if (range === 0) {
    return currentValue >= targetValue && targetValue > 0 ? 100 : 0;
  }

  return Math.min(100, Math.max(0, ((currentValue - startValue) / range) * 100));
}

function escapeCsvValue(value: string | number) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [organization, setOrganization] = useState<OrganizationData | null>(
    null,
  );
  const [objectives, setObjectives] = useState<ApiObjective[]>([]);
  const [keyResults, setKeyResults] = useState<ApiKeyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReportsData = useCallback(async (organizationId: string) => {
    const params = new URLSearchParams({ organizationId });
    const [objectivesResponse, keyResultsResponse] = await Promise.all([
      fetch(`/api/objectives?${params.toString()}`, { cache: "no-store" }),
      fetch(`/api/keyresults?${params.toString()}`, { cache: "no-store" }),
    ]);

    if (!objectivesResponse.ok) {
      throw new Error("Could not load objectives.");
    }

    if (!keyResultsResponse.ok) {
      throw new Error("Could not load key results.");
    }

    const objectivesData = (await objectivesResponse.json()) as ObjectiveResponse;
    const keyResultsData =
      (await keyResultsResponse.json()) as KeyResultResponse;

    return {
      objectives: objectivesData.objectives ?? [],
      keyResults: keyResultsData.keyResults ?? [],
    };
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      setOrganization(null);
      setObjectives([]);
      setKeyResults([]);
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
          setKeyResults([]);
          return;
        }

        const reportsData = await loadReportsData(firstOrganization.id);

        if (!isActive) {
          return;
        }

        setObjectives(reportsData.objectives);
        setKeyResults(reportsData.keyResults);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load reports.",
        );
        setObjectives([]);
        setKeyResults([]);
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
  }, [loadReportsData, session?.user, sessionStatus]);

  const report = useMemo(() => {
    const completedObjectives = objectives.filter(
      (objective) =>
        objective.status === "COMPLETED" || objective.status === "ARCHIVED",
    ).length;
    const atRiskObjectives = objectives.filter(
      (objective) =>
        objective.status === "AT_RISK" || objective.status === "OFF_TRACK",
    ).length;
    const completionRate = objectives.length
      ? (completedObjectives / objectives.length) * 100
      : 0;
    const confidenceValues = keyResults
      .map((keyResult) =>
        keyResult.confidence ? confidenceScores[keyResult.confidence] : null,
      )
      .filter((score): score is number => score !== null);
    const averageConfidenceScore = confidenceValues.length
      ? confidenceValues.reduce((total, score) => total + score, 0) /
        confidenceValues.length
      : 0;
    const typeCounts = Object.keys(keyResultTypeLabels).map((type) => {
      const keyResultType = type as ApiKeyResult["type"];
      const count = keyResults.filter(
        (keyResult) => keyResult.type === keyResultType,
      ).length;

      return {
        type: keyResultType,
        label: keyResultTypeLabels[keyResultType],
        count,
        rate: keyResults.length ? (count / keyResults.length) * 100 : 0,
      };
    });
    const teamMap = new Map<
      string,
      {
        objectives: ApiObjective[];
        keyResults: ApiKeyResult[];
      }
    >();

    objectives.forEach((objective) => {
      const team = getTeamName(
        organization,
        objective.workspace?.name,
        objective.organization?.name,
      );
      const current = teamMap.get(team) ?? { objectives: [], keyResults: [] };

      current.objectives.push(objective);
      teamMap.set(team, current);
    });

    keyResults.forEach((keyResult) => {
      const team = getTeamName(
        organization,
        keyResult.workspace?.name ?? keyResult.objective?.workspace?.name,
      );
      const current = teamMap.get(team) ?? { objectives: [], keyResults: [] };

      current.keyResults.push(keyResult);
      teamMap.set(team, current);
    });

    const teamRollups: TeamRollup[] = Array.from(teamMap.entries())
      .map(([team, data]) => {
        const teamCompletedObjectives = data.objectives.filter(
          (objective) =>
            objective.status === "COMPLETED" ||
            objective.status === "ARCHIVED",
        ).length;
        const teamAtRiskObjectives = data.objectives.filter(
          (objective) =>
            objective.status === "AT_RISK" || objective.status === "OFF_TRACK",
        ).length;
        const totalProgress = data.objectives.reduce(
          (total, objective) => total + (objective.progress ?? 0),
          0,
        );
        const teamConfidenceValues = data.keyResults
          .map((keyResult) =>
            keyResult.confidence
              ? confidenceScores[keyResult.confidence]
              : null,
          )
          .filter((score): score is number => score !== null);
        const teamAverageConfidenceScore = teamConfidenceValues.length
          ? teamConfidenceValues.reduce((total, score) => total + score, 0) /
            teamConfidenceValues.length
          : 0;

        return {
          team,
          objectiveCount: data.objectives.length,
          completedCount: teamCompletedObjectives,
          atRiskCount: teamAtRiskObjectives,
          keyResultCount: data.keyResults.length,
          averageProgress: data.objectives.length
            ? totalProgress / data.objectives.length
            : 0,
          completionRate: data.objectives.length
            ? (teamCompletedObjectives / data.objectives.length) * 100
            : 0,
          averageConfidenceScore: teamAverageConfidenceScore,
          averageConfidenceLabel: confidenceLabel(
            teamAverageConfidenceScore,
            teamConfidenceValues.length,
          ),
        };
      })
      .sort((left, right) => right.objectiveCount - left.objectiveCount);
    const averageKeyResultProgress = keyResults.length
      ? keyResults.reduce(
          (total, keyResult) => total + keyResultProgress(keyResult),
          0,
        ) / keyResults.length
      : 0;

    return {
      completionRate,
      completedObjectives,
      atRiskObjectives,
      averageConfidenceScore,
      averageConfidenceLabel: confidenceLabel(
        averageConfidenceScore,
        confidenceValues.length,
      ),
      confidenceCount: confidenceValues.length,
      typeCounts,
      teamRollups,
      averageKeyResultProgress,
    };
  }, [keyResults, objectives, organization]);

  function handleExportCsv() {
    const rows: Array<Array<string | number>> = [
      [
        "Section",
        "Name",
        "Objectives",
        "Completed Objectives",
        "At-risk Objectives",
        "Key Results",
        "Completion Rate",
        "Average Progress",
        "Average Confidence",
        "Average Confidence Score",
        "Share",
      ],
      [
        "Summary",
        organization?.name ?? "Workspace",
        objectives.length,
        report.completedObjectives,
        report.atRiskObjectives,
        keyResults.length,
        formatPercent(report.completionRate),
        formatPercent(report.averageKeyResultProgress),
        report.averageConfidenceLabel,
        Math.round(report.averageConfidenceScore),
        "100%",
      ],
      ...report.teamRollups.map((team) => [
        "Team",
        team.team,
        team.objectiveCount,
        team.completedCount,
        team.atRiskCount,
        team.keyResultCount,
        formatPercent(team.completionRate),
        formatPercent(team.averageProgress),
        team.averageConfidenceLabel,
        Math.round(team.averageConfidenceScore),
        "",
      ]),
      ...report.typeCounts.map((type) => [
        "Key result type",
        type.label,
        "",
        "",
        "",
        type.count,
        "",
        "",
        "",
        "",
        formatPercent(type.rate),
      ]),
    ];

    downloadCsv("okr-report.csv", rows);
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
                Reports
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session?.user && organization ? (
                <button
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || (objectives.length === 0 && keyResults.length === 0)}
                  type="button"
                  onClick={handleExportCsv}
                >
                  Export CSV
                </button>
              ) : null}
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
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 pb-24 pt-6 lg:pb-6">
          {loading || sessionStatus === "loading" ? (
            <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground shadow-sm">
              Loading reports...
            </div>
          ) : !session?.user ? (
            <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-normal">
                Sign in to view reports
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Reports are connected to your workspace account.
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
                Create or join an organization before viewing reports.
              </p>
            </div>
          ) : objectives.length === 0 && keyResults.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-normal">
                No report data yet
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add objectives and key results to generate rollups.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground">
                    Completion rate
                  </p>
                  <p className="mt-3 text-3xl font-semibold">
                    {formatPercent(report.completionRate)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {report.completedObjectives} of {objectives.length} objectives
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground">
                    Average confidence
                  </p>
                  <p className="mt-3 text-3xl font-semibold">
                    {report.averageConfidenceLabel}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {Math.round(report.averageConfidenceScore)} score from{" "}
                    {report.confidenceCount} key results
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground">
                    At-risk count
                  </p>
                  <p className="mt-3 text-3xl font-semibold">
                    {report.atRiskObjectives}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Includes at-risk and off-track objectives
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground">Key results</p>
                  <p className="mt-3 text-3xl font-semibold">
                    {keyResults.length}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatPercent(report.averageKeyResultProgress)} average progress
                  </p>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        Rollup
                      </p>
                      <h2 className="mt-1 text-lg font-semibold tracking-normal">
                        Per-team performance
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {organization.name ?? "Workspace"}
                    </p>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-3 pr-4 font-medium">Team</th>
                          <th className="py-3 pr-4 font-medium">Objectives</th>
                          <th className="py-3 pr-4 font-medium">Completed</th>
                          <th className="py-3 pr-4 font-medium">At risk</th>
                          <th className="py-3 pr-4 font-medium">KRs</th>
                          <th className="py-3 pr-4 font-medium">Confidence</th>
                          <th className="py-3 font-medium">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.teamRollups.map((team) => (
                          <tr key={team.team} className="border-b border-border">
                            <td className="py-4 pr-4 font-medium">{team.team}</td>
                            <td className="py-4 pr-4">{team.objectiveCount}</td>
                            <td className="py-4 pr-4">
                              {formatPercent(team.completionRate)}
                            </td>
                            <td className="py-4 pr-4">{team.atRiskCount}</td>
                            <td className="py-4 pr-4">{team.keyResultCount}</td>
                            <td className="py-4 pr-4">
                              {team.averageConfidenceLabel}
                            </td>
                            <td className="min-w-48 py-4">
                              <ProgressBar
                                value={team.averageProgress}
                                size="sm"
                                tone="green"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        Breakdown
                      </p>
                      <h2 className="mt-1 text-lg font-semibold tracking-normal">
                        Key result types
                      </h2>
                    </div>

                    <div className="mt-5 space-y-4">
                      {report.typeCounts.map((type) => (
                        <div key={type.type} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700">
                              {type.label}
                            </span>
                            <span className="text-muted-foreground">
                              {type.count}
                            </span>
                          </div>
                          <ProgressBar
                            value={type.rate}
                            size="sm"
                            tone={type.count ? "blue" : "green"}
                          />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        Export
                      </p>
                      <h2 className="mt-1 text-lg font-semibold tracking-normal">
                        CSV report
                      </h2>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Download summary, team rollup, and key result breakdown data.
                    </p>
                    <button
                      className="mt-4 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                      type="button"
                      onClick={handleExportCsv}
                    >
                      Export CSV
                    </button>
                  </section>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
