import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { OrganizationRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import {
  reminderScopeValues,
  triggerWeeklyCheckInReminders,
} from "@/lib/checkin-reminders";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const checkInConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
const reminderScopeSchema = z.enum(reminderScopeValues);

const slackOAuthStateSchema = z.object({
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1).optional(),
  installedByUserId: z.string().min(1),
  expiresAt: z.number(),
});

const slackReminderSchema = z.object({
  type: z.literal("weekly_reminders").default("weekly_reminders"),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  scope: reminderScopeSchema.default("ALL"),
});

const slackCommandSchema = z.object({
  team_id: z.string().min(1),
  team_domain: z.string().optional(),
  channel_id: z.string().min(1),
  channel_name: z.string().optional(),
  user_id: z.string().min(1),
  trigger_id: z.string().min(1),
  command: z.string().optional(),
});

type SlackOAuthState = z.infer<typeof slackOAuthStateSchema>;

type SlackApiResponse = {
  ok?: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: {
    id?: string;
    name?: string;
  };
};

type SlackInteractionPayload = {
  type?: string;
  value?: string;
  user?: {
    id?: string;
  };
  team?: {
    id?: string;
  };
  view?: {
    private_metadata?: string;
    state?: {
      values?: Record<string, Record<string, SlackViewStateValue>>;
    };
  };
};

type SlackViewStateValue = {
  type?: string;
  value?: string;
  selected_option?: {
    value?: string;
  };
};

function getAppBaseUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    process.env.AUTH_URL?.replace(/\/$/, "") ??
    request.nextUrl.origin
  );
}

function getSlackRedirectUri(request: NextRequest) {
  return `${getAppBaseUrl(request)}/api/checkins/slack`;
}

function getStateSecret() {
  return process.env.SLACK_OAUTH_STATE_SECRET ?? process.env.AUTH_SECRET;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signStatePayload(payload: string) {
  const secret = getStateSecret();

  if (!secret) {
    throw new Error("Missing OAuth state secret");
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeOAuthState(state: SlackOAuthState) {
  const payload = encodeBase64Url(JSON.stringify(state));
  const signature = signStatePayload(payload);

  return `${payload}.${signature}`;
}

function decodeOAuthState(value: string) {
  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = signStatePayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let state: unknown;

  try {
    state = JSON.parse(decodeBase64Url(payload));
  } catch {
    return null;
  }

  const parsed = slackOAuthStateSchema.safeParse(state);

  if (!parsed.success || parsed.data.expiresAt < Date.now()) {
    return null;
  }

  return parsed.data;
}

function verifySlackRequest(request: NextRequest, rawBody: string) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!signingSecret) {
    return { ok: false, error: "Slack signing secret is not configured" };
  }

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    return { ok: false, error: "Missing Slack signature headers" };
  }

  const timestampSeconds = Number(timestamp);

  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > 60 * 5
  ) {
    return { ok: false, error: "Slack request timestamp is outside the allowed window" };
  }

  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { ok: false, error: "Invalid Slack request signature" };
  }

  return { ok: true };
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
  const data = (await response.json().catch(() => ({}))) as SlackApiResponse;

  return {
    ok: response.ok && data.ok !== false,
    error: data.error ?? (response.ok ? undefined : response.statusText),
    data,
  };
}

async function requireCurrentUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null };
}

async function requireOrganizationAdmin(organizationId: string, userId: string) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      OR: [
        { ownerId: userId },
        {
          members: {
            some: {
              id: userId,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      ownerId: true,
      workspaces: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!organization) {
    return {
      organization: null,
      response: NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      role: true,
    },
  });
  const isAdmin =
    organization.ownerId === userId || user?.role === OrganizationRole.ADMIN;

  if (!isAdmin) {
    return {
      organization: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { organization, response: null };
}

async function handleOAuthStart(request: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;

  if (!clientId || !process.env.SLACK_CLIENT_SECRET || !getStateSecret()) {
    return NextResponse.json(
      { error: "Slack OAuth is not configured" },
      { status: 500 },
    );
  }

  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? undefined;
  const channelId = request.nextUrl.searchParams.get("channelId") ?? undefined;
  const channelName = request.nextUrl.searchParams.get("channelName") ?? undefined;

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  const { organization, response: organizationResponse } =
    await requireOrganizationAdmin(organizationId, user.id);

  if (organizationResponse || !organization) {
    return organizationResponse;
  }

  if (
    workspaceId &&
    !organization.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const state = encodeOAuthState({
    organizationId,
    workspaceId,
    channelId,
    channelName,
    installedByUserId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  const authorizationUrl = new URL("https://slack.com/oauth/v2/authorize");

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("scope", "commands,chat:write");
  authorizationUrl.searchParams.set("redirect_uri", getSlackRedirectUri(request));
  authorizationUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizationUrl);
}

async function handleOAuthCallback(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateValue = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const redirectBase = getAppBaseUrl(request);

  if (error) {
    return NextResponse.redirect(
      `${redirectBase}/dashboard?slack=error&reason=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !stateValue) {
    return NextResponse.json(
      { error: "Slack OAuth callback is missing code or state" },
      { status: 400 },
    );
  }

  const state = decodeOAuthState(stateValue);

  if (!state) {
    return NextResponse.json(
      { error: "Invalid or expired Slack OAuth state" },
      { status: 400 },
    );
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Slack OAuth is not configured" },
      { status: 500 },
    );
  }

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: getSlackRedirectUri(request),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as SlackApiResponse;

  if (!response.ok || data.ok === false || !data.access_token || !data.team?.id) {
    return NextResponse.json(
      { error: data.error ?? "Slack OAuth exchange failed" },
      { status: 400 },
    );
  }

  await prisma.slackIntegration.upsert({
    where: {
      teamId: data.team.id,
    },
    update: {
      teamName: data.team.name,
      channelId: state.channelId,
      channelName: state.channelName,
      botUserId: data.bot_user_id,
      botAccessToken: data.access_token,
      organizationId: state.organizationId,
      workspaceId: state.workspaceId,
      installedByUserId: state.installedByUserId,
      installedAt: new Date(),
    },
    create: {
      teamId: data.team.id,
      teamName: data.team.name,
      channelId: state.channelId,
      channelName: state.channelName,
      botUserId: data.bot_user_id,
      botAccessToken: data.access_token,
      organizationId: state.organizationId,
      workspaceId: state.workspaceId,
      installedByUserId: state.installedByUserId,
    },
  });

  return NextResponse.redirect(`${redirectBase}/dashboard?slack=connected`);
}

function slackEphemeral(text: string, status = 200) {
  return NextResponse.json(
    {
      response_type: "ephemeral",
      text,
    },
    { status },
  );
}

function buildCheckInModal({
  integrationId,
  channelId,
  slackUserId,
}: {
  integrationId: string;
  channelId: string;
  slackUserId: string;
}) {
  return {
    type: "modal",
    callback_id: "okr_checkin_submission",
    title: {
      type: "plain_text",
      text: "Submit check-in",
    },
    submit: {
      type: "plain_text",
      text: "Submit",
    },
    close: {
      type: "plain_text",
      text: "Cancel",
    },
    private_metadata: JSON.stringify({
      integrationId,
      channelId,
      slackUserId,
    }),
    blocks: [
      {
        type: "input",
        block_id: "target",
        label: {
          type: "plain_text",
          text: "OKR or KPI",
        },
        element: {
          type: "external_select",
          action_id: "checkin_target",
          min_query_length: 0,
          placeholder: {
            type: "plain_text",
            text: "Search objectives, key results, or KPIs",
          },
        },
      },
      {
        type: "input",
        block_id: "confidence",
        label: {
          type: "plain_text",
          text: "Confidence",
        },
        element: {
          type: "static_select",
          action_id: "checkin_confidence",
          initial_option: {
            text: {
              type: "plain_text",
              text: "High",
            },
            value: "HIGH",
          },
          options: [
            {
              text: {
                type: "plain_text",
                text: "High",
              },
              value: "HIGH",
            },
            {
              text: {
                type: "plain_text",
                text: "Medium",
              },
              value: "MEDIUM",
            },
            {
              text: {
                type: "plain_text",
                text: "Low",
              },
              value: "LOW",
            },
          ],
        },
      },
      {
        type: "input",
        block_id: "note",
        optional: true,
        label: {
          type: "plain_text",
          text: "Update",
        },
        element: {
          type: "plain_text_input",
          action_id: "checkin_note",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Progress, blockers, and next step",
          },
        },
      },
      {
        type: "input",
        block_id: "progress",
        optional: true,
        label: {
          type: "plain_text",
          text: "Progress percent",
        },
        element: {
          type: "plain_text_input",
          action_id: "checkin_progress",
          placeholder: {
            type: "plain_text",
            text: "0 to 100",
          },
        },
      },
      {
        type: "input",
        block_id: "value",
        optional: true,
        label: {
          type: "plain_text",
          text: "Current value",
        },
        element: {
          type: "plain_text_input",
          action_id: "checkin_value",
          placeholder: {
            type: "plain_text",
            text: "Metric or key result value",
          },
        },
      },
    ],
  };
}

async function handleSlashCommand(params: URLSearchParams) {
  const parsed = slackCommandSchema.safeParse(Object.fromEntries(params));

  if (!parsed.success) {
    return slackEphemeral("Slack sent an invalid check-in command.", 400);
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: {
      teamId: parsed.data.team_id,
    },
    select: {
      id: true,
      botAccessToken: true,
      channelId: true,
      channelName: true,
    },
  });

  if (!integration) {
    return slackEphemeral(
      "This Slack workspace is not connected to OKR Management yet. Ask an admin to start the Slack setup from the app.",
    );
  }

  if (
    integration.channelId !== parsed.data.channel_id ||
    integration.channelName !== parsed.data.channel_name
  ) {
    await prisma.slackIntegration.update({
      where: {
        id: integration.id,
      },
      data: {
        channelId: parsed.data.channel_id,
        channelName: parsed.data.channel_name,
      },
    });
  }

  const modal = buildCheckInModal({
    integrationId: integration.id,
    channelId: parsed.data.channel_id,
    slackUserId: parsed.data.user_id,
  });
  const result = await callSlackApi("views.open", integration.botAccessToken, {
    trigger_id: parsed.data.trigger_id,
    view: modal,
  });

  if (!result.ok) {
    return slackEphemeral(
      `I could not open the check-in form in Slack: ${result.error ?? "unknown_error"}`,
      500,
    );
  }

  return slackEphemeral("Opening your check-in form.");
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function makeSlackOption(label: string, value: string, description?: string) {
  return {
    text: {
      type: "plain_text",
      text: truncate(label, 75),
    },
    value,
    ...(description
      ? {
          description: {
            type: "plain_text",
            text: truncate(description, 75),
          },
        }
      : {}),
  };
}

async function handleBlockSuggestion(payload: SlackInteractionPayload) {
  const teamId = payload.team?.id;

  if (!teamId) {
    return NextResponse.json({ options: [] });
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: {
      teamId,
    },
    select: {
      organizationId: true,
      workspaceId: true,
    },
  });

  if (!integration) {
    return NextResponse.json({ options: [] });
  }

  const query = payload.value?.trim();
  const titleSearch = query
    ? {
        contains: query,
        mode: "insensitive" as const,
      }
    : undefined;
  const targetWhere = {
    organizationId: integration.organizationId,
    workspaceId: integration.workspaceId ?? undefined,
  };
  const [objectives, keyResults, metrics] = await Promise.all([
    prisma.objective.findMany({
      where: {
        ...targetWhere,
        ...(titleSearch ? { title: titleSearch } : {}),
        status: {
          notIn: ["COMPLETED", "ARCHIVED"],
        },
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 25,
    }),
    prisma.keyResult.findMany({
      where: {
        ...targetWhere,
        ...(titleSearch ? { title: titleSearch } : {}),
        objective: {
          status: {
            notIn: ["COMPLETED", "ARCHIVED"],
          },
        },
      },
      select: {
        id: true,
        title: true,
        objective: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 25,
    }),
    prisma.metric.findMany({
      where: {
        ...targetWhere,
        ...(titleSearch ? { title: titleSearch } : {}),
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 25,
    }),
  ]);

  return NextResponse.json({
    options: [
      ...objectives.map((objective) =>
        makeSlackOption(`Objective: ${objective.title}`, `objective:${objective.id}`),
      ),
      ...keyResults.map((keyResult) =>
        makeSlackOption(
          `Key result: ${keyResult.title}`,
          `keyResult:${keyResult.id}`,
          keyResult.objective.title,
        ),
      ),
      ...metrics.map((metric) =>
        makeSlackOption(`KPI: ${metric.title}`, `metric:${metric.id}`),
      ),
    ].slice(0, 100),
  });
}

function getViewValue(
  payload: SlackInteractionPayload,
  blockId: string,
  actionId: string,
) {
  const action = payload.view?.state?.values?.[blockId]?.[actionId];

  return action?.selected_option?.value ?? action?.value ?? "";
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrivateMetadata(value?: string) {
  if (!value) {
    return null;
  }

  let metadata: unknown;

  try {
    metadata = JSON.parse(value);
  } catch {
    return null;
  }

  const parsed = z
    .object({
      integrationId: z.string().min(1),
      channelId: z.string().min(1),
      slackUserId: z.string().min(1),
    })
    .safeParse(metadata);

  return parsed.success ? parsed.data : null;
}

function slackModalErrors(errors: Record<string, string>) {
  return NextResponse.json({
    response_action: "errors",
    errors,
  });
}

async function handleViewSubmission(payload: SlackInteractionPayload) {
  const metadata = parsePrivateMetadata(payload.view?.private_metadata);
  const target = getViewValue(payload, "target", "checkin_target");
  const confidence = checkInConfidenceSchema.safeParse(
    getViewValue(payload, "confidence", "checkin_confidence"),
  );
  const note = getViewValue(payload, "note", "checkin_note").trim();
  const progress = parseOptionalNumber(
    getViewValue(payload, "progress", "checkin_progress"),
  );
  const value = parseOptionalNumber(getViewValue(payload, "value", "checkin_value"));
  const errors: Record<string, string> = {};

  if (!metadata) {
    errors.target = "This Slack check-in session expired. Open a new one with /checkin.";
  }

  if (!target) {
    errors.target = "Choose an OKR or KPI.";
  }

  if (!confidence.success) {
    errors.confidence = "Choose a confidence level.";
  }

  if (progress === null || (typeof progress === "number" && (progress < 0 || progress > 100))) {
    errors.progress = "Progress must be a number from 0 to 100.";
  }

  if (value === null) {
    errors.value = "Current value must be a number.";
  }

  if (Object.keys(errors).length > 0 || !metadata || !confidence.success) {
    return slackModalErrors(errors);
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: {
      id: metadata.integrationId,
    },
  });

  if (!integration) {
    return slackModalErrors({
      target: "This Slack workspace is not connected anymore.",
    });
  }

  const [targetType, targetId] = target.split(":");
  const checkInData: Prisma.CheckInCreateInput = {
    note: note || undefined,
    confidence: confidence.data,
    progress,
    value,
    organization: {
      connect: {
        id: integration.organizationId,
      },
    },
    ...(integration.workspaceId
      ? {
          workspace: {
            connect: {
              id: integration.workspaceId,
            },
          },
        }
      : {}),
  };
  const operations: Prisma.PrismaPromise<unknown>[] = [];
  let targetTitle = "your OKR";

  if (targetType === "objective") {
    const objective = await prisma.objective.findFirst({
      where: {
        id: targetId,
        organizationId: integration.organizationId,
        workspaceId: integration.workspaceId ?? undefined,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!objective) {
      return slackModalErrors({ target: "Choose an objective this workspace can access." });
    }

    targetTitle = objective.title;
    checkInData.objective = {
      connect: {
        id: objective.id,
      },
    };

    if (typeof progress === "number") {
      operations.push(
        prisma.objective.update({
          where: {
            id: objective.id,
          },
          data: {
            progress,
          },
        }),
      );
    }
  } else if (targetType === "keyResult") {
    const keyResult = await prisma.keyResult.findFirst({
      where: {
        id: targetId,
        organizationId: integration.organizationId,
        workspaceId: integration.workspaceId ?? undefined,
      },
      select: {
        id: true,
        title: true,
        objectiveId: true,
      },
    });

    if (!keyResult) {
      return slackModalErrors({ target: "Choose a key result this workspace can access." });
    }

    targetTitle = keyResult.title;
    checkInData.objective = {
      connect: {
        id: keyResult.objectiveId,
      },
    };
    checkInData.keyResult = {
      connect: {
        id: keyResult.id,
      },
    };

    operations.push(
      prisma.keyResult.update({
        where: {
          id: keyResult.id,
        },
        data: {
          confidence: confidence.data,
          ...(typeof value === "number" ? { currentValue: value } : {}),
        },
      }),
    );
  } else if (targetType === "metric") {
    const metric = await prisma.metric.findFirst({
      where: {
        id: targetId,
        organizationId: integration.organizationId,
        workspaceId: integration.workspaceId ?? undefined,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!metric) {
      return slackModalErrors({ target: "Choose a KPI this workspace can access." });
    }

    targetTitle = metric.title;
    checkInData.metric = {
      connect: {
        id: metric.id,
      },
    };

    if (typeof value === "number") {
      operations.push(
        prisma.metric.update({
          where: {
            id: metric.id,
          },
          data: {
            currentValue: value,
          },
        }),
      );
    }
  } else {
    return slackModalErrors({ target: "Choose a valid OKR or KPI." });
  }

  operations.unshift(
    prisma.checkIn.create({
      data: checkInData,
    }),
  );

  await prisma.$transaction(operations);

  await callSlackApi("chat.postMessage", integration.botAccessToken, {
    channel: metadata.channelId,
    text: `Check-in submitted for ${targetTitle}.`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Check-in submitted* for ${targetTitle}\nConfidence: *${confidence.data.toLowerCase()}*`,
        },
      },
    ],
  });

  return NextResponse.json({
    response_action: "clear",
  });
}

async function handleInteraction(payloadValue: string | null) {
  if (!payloadValue) {
    return NextResponse.json({ error: "Missing Slack payload" }, { status: 400 });
  }

  let payload: SlackInteractionPayload;

  try {
    payload = JSON.parse(payloadValue) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Slack payload" }, { status: 400 });
  }

  if (payload.type === "block_suggestion") {
    return handleBlockSuggestion(payload);
  }

  if (payload.type === "view_submission") {
    return handleViewSubmission(payload);
  }

  return NextResponse.json({});
}

async function authorizeReminderTrigger(request: NextRequest) {
  const reminderSecret = process.env.SLACK_REMINDER_SECRET;
  const authorization = request.headers.get("authorization");

  if (reminderSecret && authorization === `Bearer ${reminderSecret}`) {
    return null;
  }

  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

async function handleJsonPost(request: NextRequest, rawBody: string) {
  const unauthorized = await authorizeReminderTrigger(request);

  if (unauthorized) {
    return unauthorized;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = slackReminderSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Slack reminder payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { organizationId, workspaceId, scope, teamId } = parsed.data;
  const result = await triggerWeeklyCheckInReminders({
    organizationId,
    workspaceId,
    scope,
    teamId,
    postToSlack: true,
  });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("error")) {
    return handleOAuthCallback(request);
  }

  return handleOAuthStart(request);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return handleJsonPost(request, rawBody);
  }

  const verification = verifySlackRequest(request, rawBody);

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);

  if (params.has("payload")) {
    return handleInteraction(params.get("payload"));
  }

  return handleSlashCommand(params);
}
