import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  reminderScopeValues,
  triggerWeeklyCheckInReminders,
} from "@/lib/checkin-reminders";
import { auth } from "@/lib/auth";

const reminderScopeSchema = z.enum(reminderScopeValues);

const triggerReminderSchema = z.object({
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  scope: reminderScopeSchema.default("ALL"),
});

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function getReminderTitle(scope: z.infer<typeof reminderScopeSchema>) {
  if (scope === "OKRS") {
    return "Weekly OKR check-in reminder";
  }

  if (scope === "KPIS") {
    return "Weekly KPI check-in reminder";
  }

  return "Weekly check-in reminder";
}

function buildCheckInModalPrompt({
  counts,
  scope,
}: {
  counts: {
    objectives: number;
    keyResults: number;
    metrics: number;
  };
  scope: z.infer<typeof reminderScopeSchema>;
}) {
  const totalDue = counts.objectives + counts.keyResults + counts.metrics;

  return {
    open: totalDue > 0,
    title: getReminderTitle(scope),
    message: totalDue
      ? `${totalDue} weekly check-in${totalDue === 1 ? "" : "s"} need an update.`
      : "No weekly check-ins are due right now.",
    checkInUrl: `${getAppUrl()}/check-ins?modal=weekly&scope=${scope.toLowerCase()}`,
    counts,
  };
}

async function requireSession() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = triggerReminderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reminder payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { organizationId, workspaceId, teamId, scope } = parsed.data;
  const result = await triggerWeeklyCheckInReminders({
    organizationId,
    workspaceId,
    scope,
    postToSlack: true,
    teamId,
  });

  return NextResponse.json({
    ...result,
    modal: buildCheckInModalPrompt({
      counts: result.counts,
      scope,
    }),
  });
}
