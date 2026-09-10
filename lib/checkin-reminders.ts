import { CheckInCadence, ObjectiveStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const reminderScopeValues = ["ALL", "OKRS", "KPIS"] as const;

export type ReminderScope = (typeof reminderScopeValues)[number];

type ReminderTarget = {
  id: string;
  title: string;
  owner?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type KeyResultReminderTarget = ReminderTarget & {
  objective?: {
    title?: string | null;
  } | null;
};

export type WeeklyCheckInReminders = {
  objectives: ReminderTarget[];
  keyResults: KeyResultReminderTarget[];
  metrics: ReminderTarget[];
};

export type SlackReminderDelivery = {
  integrationId: string;
  teamId: string;
  channelId: string;
  ok: boolean;
  error?: string;
};

function weeklyReminderWhere(organizationId: string, workspaceId?: string) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return {
    organizationId,
    workspaceId,
    checkInCadence: CheckInCadence.WEEKLY,
    OR: [
      { lastCheckInReminderAt: null },
      { lastCheckInReminderAt: { lte: oneWeekAgo } },
    ],
  };
}

export function countWeeklyCheckInReminders(reminders: WeeklyCheckInReminders) {
  return {
    objectives: reminders.objectives.length,
    keyResults: reminders.keyResults.length,
    metrics: reminders.metrics.length,
  };
}

export async function collectWeeklyCheckInReminders({
  organizationId,
  workspaceId,
  scope,
}: {
  organizationId: string;
  workspaceId?: string;
  scope: ReminderScope;
}): Promise<WeeklyCheckInReminders> {
  const okrWhere = {
    ...weeklyReminderWhere(organizationId, workspaceId),
    status: {
      notIn: [ObjectiveStatus.COMPLETED, ObjectiveStatus.ARCHIVED],
    },
  };
  const keyResultWhere = {
    ...weeklyReminderWhere(organizationId, workspaceId),
    objective: {
      status: {
        notIn: [ObjectiveStatus.COMPLETED, ObjectiveStatus.ARCHIVED],
      },
    },
  };
  const metricWhere = weeklyReminderWhere(organizationId, workspaceId);

  const [objectives, keyResults, metrics] = await Promise.all([
    scope === "KPIS"
      ? Promise.resolve([])
      : prisma.objective.findMany({
          where: okrWhere,
          select: {
            id: true,
            title: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        }),
    scope === "KPIS"
      ? Promise.resolve([])
      : prisma.keyResult.findMany({
          where: keyResultWhere,
          select: {
            id: true,
            title: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
            objective: {
              select: {
                title: true,
              },
            },
          },
        }),
    scope === "OKRS"
      ? Promise.resolve([])
      : prisma.metric.findMany({
          where: metricWhere,
          select: {
            id: true,
            title: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        }),
  ]);

  return {
    objectives,
    keyResults,
    metrics,
  };
}

async function markWeeklyCheckInRemindersSent({
  reminders,
  scope,
  triggeredAt,
}: {
  reminders: WeeklyCheckInReminders;
  scope: ReminderScope;
  triggeredAt: Date;
}) {
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  if (scope !== "KPIS" && reminders.objectives.length > 0) {
    operations.push(
      prisma.objective.updateMany({
        where: {
          id: {
            in: reminders.objectives.map((objective) => objective.id),
          },
        },
        data: {
          lastCheckInReminderAt: triggeredAt,
        },
      }),
    );
  }

  if (scope !== "KPIS" && reminders.keyResults.length > 0) {
    operations.push(
      prisma.keyResult.updateMany({
        where: {
          id: {
            in: reminders.keyResults.map((keyResult) => keyResult.id),
          },
        },
        data: {
          lastCheckInReminderAt: triggeredAt,
        },
      }),
    );
  }

  if (scope !== "OKRS" && reminders.metrics.length > 0) {
    operations.push(
      prisma.metric.updateMany({
        where: {
          id: {
            in: reminders.metrics.map((metric) => metric.id),
          },
        },
        data: {
          lastCheckInReminderAt: triggeredAt,
        },
      }),
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function formatOwner(target: ReminderTarget) {
  return target.owner?.name || target.owner?.email || "Unassigned";
}

function formatReminderLines(reminders: WeeklyCheckInReminders) {
  const lines = [
    ...reminders.objectives.map(
      (objective) => `- Objective: ${objective.title} (${formatOwner(objective)})`,
    ),
    ...reminders.keyResults.map((keyResult) => {
      const parent = keyResult.objective?.title
        ? ` in ${keyResult.objective.title}`
        : "";

      return `- Key result: ${keyResult.title}${parent} (${formatOwner(keyResult)})`;
    }),
    ...reminders.metrics.map(
      (metric) => `- KPI: ${metric.title} (${formatOwner(metric)})`,
    ),
  ];

  return lines.length > 0 ? lines.slice(0, 10).join("\n") : "";
}

async function callSlackApi(
  method: string,
  token: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };

  return {
    ok: response.ok && data.ok !== false,
    error: data.error ?? (response.ok ? undefined : response.statusText),
  };
}

async function postWeeklySlackReminders({
  organizationId,
  workspaceId,
  teamId,
  reminders,
}: {
  organizationId: string;
  workspaceId?: string;
  teamId?: string;
  reminders: WeeklyCheckInReminders;
}): Promise<SlackReminderDelivery[]> {
  const counts = countWeeklyCheckInReminders(reminders);
  const total = counts.objectives + counts.keyResults + counts.metrics;

  if (total === 0) {
    return [];
  }

  const integrations = await prisma.slackIntegration.findMany({
    where: {
      organizationId,
      workspaceId,
      teamId,
      channelId: {
        not: null,
      },
    },
    select: {
      id: true,
      teamId: true,
      channelId: true,
      botAccessToken: true,
    },
  });

  const reminderLines = formatReminderLines(reminders);
  const overflowCount = Math.max(0, total - 10);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL;
  const detailsText = [
    reminderLines,
    overflowCount > 0 ? `...and ${overflowCount} more.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return Promise.all(
    integrations.map(async (integration) => {
      const result = await callSlackApi(
        "chat.postMessage",
        integration.botAccessToken,
        {
          channel: integration.channelId,
          text: `Weekly check-ins are due for ${total} item${total === 1 ? "" : "s"}.`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "Weekly check-ins are due",
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Use \`/checkin\` to submit an update from Slack. Due now: *${counts.objectives}* objectives, *${counts.keyResults}* key results, and *${counts.metrics}* KPIs.`,
              },
            },
            ...(detailsText
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: truncate(detailsText, 2500),
                    },
                  },
                ]
              : []),
            ...(appUrl
              ? [
                  {
                    type: "actions",
                    elements: [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "Open check-in modal",
                        },
                        url: `${appUrl.replace(
                          /\/$/,
                          "",
                        )}/check-ins?modal=weekly`,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
      );

      return {
        integrationId: integration.id,
        teamId: integration.teamId,
        channelId: integration.channelId ?? "",
        ok: result.ok,
        ...(result.error ? { error: result.error } : {}),
      };
    }),
  );
}

export async function triggerWeeklyCheckInReminders({
  organizationId,
  workspaceId,
  scope,
  postToSlack = false,
  teamId,
}: {
  organizationId: string;
  workspaceId?: string;
  scope: ReminderScope;
  postToSlack?: boolean;
  teamId?: string;
}) {
  const triggeredAt = new Date();
  const reminders = await collectWeeklyCheckInReminders({
    organizationId,
    workspaceId,
    scope,
  });
  const counts = countWeeklyCheckInReminders(reminders);
  const total = counts.objectives + counts.keyResults + counts.metrics;
  const slackDeliveries = postToSlack
    ? await postWeeklySlackReminders({
        organizationId,
        workspaceId,
        teamId,
        reminders,
      })
    : [];
  const canMarkSent =
    !postToSlack ||
    total === 0 ||
    (slackDeliveries.length > 0 &&
      slackDeliveries.every((delivery) => delivery.ok));

  if (canMarkSent) {
    await markWeeklyCheckInRemindersSent({
      reminders,
      scope,
      triggeredAt,
    });
  }

  return {
    triggeredAt,
    counts,
    reminders,
    statusUpdated: canMarkSent && total > 0,
    slack: {
      deliveries: slackDeliveries,
      posted: slackDeliveries.filter((delivery) => delivery.ok).length,
      failed: slackDeliveries.filter((delivery) => !delivery.ok).length,
      skipped:
        postToSlack && total > 0 && slackDeliveries.length === 0
          ? "No Slack integration with a channel was found."
          : undefined,
    },
  };
}
