import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { OrganizationRole, type Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const pullRequestCountModeSchema = z
  .enum(["all", "open", "closed", "merged"])
  .default("merged");

const githubOAuthStateSchema = z.object({
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  keyResultId: z.string().min(1).optional(),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/).optional(),
  countMode: pullRequestCountModeSchema,
  installedByUserId: z.string().min(1),
  expiresAt: z.number(),
});

const manualProgressUpdateSchema = z.object({
  keyResultId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  prCount: z.number().int().min(0),
  incrementBy: z.number().positive().optional(),
});

type GitHubOAuthState = z.infer<typeof githubOAuthStateSchema>;
type PullRequestCountMode = z.infer<typeof pullRequestCountModeSchema>;

type GitHubAccessTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
  token_type?: string;
};

type GitHubUserResponse = {
  id?: number;
  login?: string;
  name?: string | null;
};

type GitHubWebhookPayload = {
  action?: string;
  repository?: {
    full_name?: string;
    default_branch?: string;
  };
  pull_request?: {
    html_url?: string;
    merged?: boolean;
    merged_at?: string | null;
    base?: {
      ref?: string;
    };
  };
};

function getAppBaseUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    process.env.AUTH_URL?.replace(/\/$/, "") ??
    request.nextUrl.origin
  );
}

function getGitHubRedirectUri(request: NextRequest) {
  return `${getAppBaseUrl(request)}/api/integrations/github`;
}

function getStateSecret() {
  return process.env.GITHUB_OAUTH_STATE_SECRET ?? process.env.AUTH_SECRET;
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

function encodeOAuthState(state: GitHubOAuthState) {
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

  const parsed = githubOAuthStateSchema.safeParse(state);

  if (!parsed.success || parsed.data.expiresAt < Date.now()) {
    return null;
  }

  return parsed.data;
}

function verifyGitHubWebhookSignature(request: NextRequest, rawBody: string) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return { ok: false, error: "GitHub webhook secret is not configured" };
  }

  const signature = request.headers.get("x-hub-signature-256");

  if (!signature) {
    return { ok: false, error: "Missing GitHub signature header" };
  }

  const expected = `sha256=${createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex")}`;
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { ok: false, error: "Invalid GitHub webhook signature" };
  }

  return { ok: true };
}

async function requireCurrentUser(): Promise<
  | { user: Pick<User, "id" | "email" | "role">; response: null }
  | { user: null; response: NextResponse }
> {
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

async function requireKeyResultAccess(
  keyResultId: string,
  organizationId?: string,
  workspaceId?: string,
) {
  const keyResult = await prisma.keyResult.findFirst({
    where: {
      id: keyResultId,
      organizationId,
      workspaceId,
    },
    select: {
      id: true,
      title: true,
      currentValue: true,
      targetValue: true,
      organizationId: true,
      workspaceId: true,
      objectiveId: true,
    },
  });

  if (!keyResult) {
    return {
      keyResult: null,
      response: NextResponse.json(
        { error: "Key result not found" },
        { status: 404 },
      ),
    };
  }

  return { keyResult, response: null };
}

async function fetchGitHubJson<T>(
  url: string,
  accessToken?: string,
  init?: RequestInit,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T;

  return { response, data };
}

async function exchangeOAuthCode(request: NextRequest, code: string) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      data: null,
      response: NextResponse.json(
        { error: "GitHub OAuth is not configured" },
        { status: 500 },
      ),
    };
  }

  const { response, data } = await fetchGitHubJson<GitHubAccessTokenResponse>(
    "https://github.com/login/oauth/access_token",
    undefined,
    {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: getGitHubRedirectUri(request),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok || data.error || !data.access_token) {
    return {
      data: null,
      response: NextResponse.json(
        { error: data.error_description ?? data.error ?? "GitHub OAuth failed" },
        { status: 400 },
      ),
    };
  }

  return { data, response: null };
}

function buildGitHubSearchQuery(
  repository: string,
  mode: PullRequestCountMode,
  baseBranch?: string,
) {
  const qualifiers = [`repo:${repository}`, "type:pr"];

  if (mode === "open") {
    qualifiers.push("is:open");
  } else if (mode === "closed") {
    qualifiers.push("is:closed");
  } else if (mode === "merged") {
    qualifiers.push("is:merged");
  }

  if (baseBranch) {
    qualifiers.push(`base:${baseBranch}`);
  }

  return qualifiers.join(" ");
}

function parsePullRequestCountMode(value: string | null) {
  const parsed = pullRequestCountModeSchema.safeParse(value ?? undefined);

  if (!parsed.success) {
    return {
      countMode: null,
      response: NextResponse.json(
        { error: "countMode must be all, open, closed, or merged" },
        { status: 400 },
      ),
    };
  }

  return { countMode: parsed.data, response: null };
}

async function fetchGitHubPullRequestCount({
  repository,
  mode,
  baseBranch,
  accessToken,
}: {
  repository: string;
  mode: PullRequestCountMode;
  baseBranch?: string;
  accessToken?: string;
}) {
  const url = new URL("https://api.github.com/search/issues");

  url.searchParams.set("q", buildGitHubSearchQuery(repository, mode, baseBranch));
  url.searchParams.set("per_page", "1");

  const { response, data } = await fetchGitHubJson<{ total_count?: number }>(
    url.toString(),
    accessToken,
  );

  if (!response.ok || typeof data.total_count !== "number") {
    throw new Error("Unable to fetch GitHub pull request count");
  }

  return data.total_count;
}

async function updateObjectiveProgressFromKeyResults(
  tx: Prisma.TransactionClient,
  objectiveId: string,
) {
  const keyResults = await tx.keyResult.findMany({
    where: {
      objectiveId,
    },
    select: {
      startValue: true,
      targetValue: true,
      currentValue: true,
    },
  });

  if (keyResults.length === 0) {
    return null;
  }

  const progress =
    keyResults.reduce((total, keyResult) => {
      const range = keyResult.targetValue - keyResult.startValue;

      if (range === 0) {
        return total + (keyResult.currentValue >= keyResult.targetValue ? 100 : 0);
      }

      const keyResultProgress =
        ((keyResult.currentValue - keyResult.startValue) / range) * 100;

      return total + Math.min(100, Math.max(0, keyResultProgress));
    }, 0) / keyResults.length;

  await tx.objective.update({
    where: {
      id: objectiveId,
    },
    data: {
      progress: Math.round(progress),
    },
  });

  return Math.round(progress);
}

async function updateKeyResultProgressFromGithubPrCount({
  keyResultId,
  organizationId,
  prCount,
  incrementBy = 1,
  deliveryId,
  mergedPullRequestUrl,
  mergedAt,
}: {
  keyResultId: string;
  organizationId?: string;
  prCount: number;
  incrementBy?: number;
  deliveryId?: string;
  mergedPullRequestUrl?: string;
  mergedAt?: Date;
}) {
  const nextValue = prCount * incrementBy;
  const result = await prisma.$transaction(async (tx) => {
    const keyResult = await tx.keyResult.findFirst({
      where: {
        id: keyResultId,
        organizationId,
      },
      select: {
        id: true,
        title: true,
        organizationId: true,
        workspaceId: true,
        objectiveId: true,
      },
    });

    if (!keyResult) {
      return null;
    }

    const updatedKeyResult = await tx.keyResult.update({
      where: {
        id: keyResult.id,
      },
      data: {
        currentValue: nextValue,
      },
      include: {
        objective: true,
        workspace: true,
        githubIntegration: true,
      },
    });
    const objectiveProgress = await updateObjectiveProgressFromKeyResults(
      tx,
      keyResult.objectiveId,
    );

    await tx.gitHubIntegration.updateMany({
      where: {
        keyResultId: keyResult.id,
      },
      data: {
        lastDeliveryId: deliveryId,
        lastMergedPullRequestUrl: mergedPullRequestUrl,
        lastMergedAt: mergedAt,
      },
    });

    await tx.checkIn.create({
      data: {
        note:
          incrementBy === 1
            ? `GitHub PR count synced: ${prCount}`
            : `GitHub PR count synced: ${prCount} PRs x ${incrementBy}`,
        confidence: "HIGH",
        value: nextValue,
        organizationId: keyResult.organizationId,
        workspaceId: keyResult.workspaceId,
        objectiveId: keyResult.objectiveId,
        keyResultId: keyResult.id,
      },
    });

    return {
      keyResult: updatedKeyResult,
      objectiveProgress,
    };
  });

  if (!result) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Key result not found" },
        { status: 404 },
      ),
    };
  }

  return { ok: true as const, ...result };
}

async function syncGitHubIntegrationFromPrCount({
  integration,
  repository,
  countMode,
  accessToken,
  deliveryId,
  mergedPullRequestUrl,
  mergedAt,
}: {
  integration: {
    keyResultId: string;
    organizationId: string;
    branch: string | null;
    incrementBy: number;
  };
  repository: string;
  countMode: PullRequestCountMode;
  accessToken?: string;
  deliveryId?: string;
  mergedPullRequestUrl?: string;
  mergedAt?: Date;
}) {
  const prCount = await fetchGitHubPullRequestCount({
    repository,
    mode: countMode,
    baseBranch: integration.branch ?? undefined,
    accessToken,
  });

  const result = await updateKeyResultProgressFromGithubPrCount({
    keyResultId: integration.keyResultId,
    organizationId: integration.organizationId,
    prCount,
    incrementBy: integration.incrementBy,
    deliveryId,
    mergedPullRequestUrl,
    mergedAt,
  });

  return { prCount, result };
}

async function handleOAuthStart(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId || !process.env.GITHUB_CLIENT_SECRET || !getStateSecret()) {
    return NextResponse.json(
      { error: "GitHub OAuth is not configured" },
      { status: 500 },
    );
  }

  const { user, response } = await requireCurrentUser();

  if (response) {
    return response;
  }

  const { searchParams } = request.nextUrl;
  const organizationId = searchParams.get("organizationId");
  const workspaceId = searchParams.get("workspaceId") ?? undefined;
  const keyResultId = searchParams.get("keyResultId") ?? undefined;
  const repository = searchParams.get("repository") ?? undefined;
  const { countMode, response: countModeResponse } = parsePullRequestCountMode(
    searchParams.get("countMode"),
  );

  if (countModeResponse) {
    return countModeResponse;
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  const { organization, response: organizationResponse } =
    await requireOrganizationAdmin(organizationId, user.id);

  if (organizationResponse) {
    return organizationResponse;
  }

  if (
    workspaceId &&
    !organization.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (keyResultId) {
    const { response: keyResultResponse } = await requireKeyResultAccess(
      keyResultId,
      organizationId,
      workspaceId,
    );

    if (keyResultResponse) {
      return keyResultResponse;
    }
  }

  const repositoryValidation = z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/)
    .optional()
    .safeParse(repository);

  if (!repositoryValidation.success) {
    return NextResponse.json(
      { error: "repository must use the owner/name format" },
      { status: 400 },
    );
  }

  const state = encodeOAuthState({
    organizationId,
    workspaceId,
    keyResultId,
    repository,
    countMode,
    installedByUserId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", getGitHubRedirectUri(request));
  authorizationUrl.searchParams.set("scope", "repo");
  authorizationUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizationUrl);
}

async function handleOAuthCallback(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const stateValue = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const redirectBase = getAppBaseUrl(request);

  if (error) {
    return NextResponse.redirect(
      `${redirectBase}/dashboard?github=error&reason=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !stateValue) {
    return NextResponse.json(
      { error: "GitHub OAuth callback is missing code or state" },
      { status: 400 },
    );
  }

  const state = decodeOAuthState(stateValue);

  if (!state) {
    return NextResponse.json(
      { error: "Invalid or expired GitHub OAuth state" },
      { status: 400 },
    );
  }

  const { data, response } = await exchangeOAuthCode(request, code);

  if (response) {
    return response;
  }

  const userResponse = await fetchGitHubJson<GitHubUserResponse>(
    "https://api.github.com/user",
    data.access_token,
  );
  const githubLogin = userResponse.data.login ?? "unknown";

  if (state.keyResultId && state.repository) {
    const prCount = await fetchGitHubPullRequestCount({
      repository: state.repository,
      mode: state.countMode,
      accessToken: data.access_token,
    });

    await updateKeyResultProgressFromGithubPrCount({
      keyResultId: state.keyResultId,
      organizationId: state.organizationId,
      prCount,
    });
  }

  const redirectUrl = new URL(`${redirectBase}/dashboard`);

  redirectUrl.searchParams.set("github", "connected");
  redirectUrl.searchParams.set("login", githubLogin);

  return NextResponse.redirect(redirectUrl);
}

async function handlePullRequestWebhook(
  request: NextRequest,
  payload: GitHubWebhookPayload,
): Promise<NextResponse> {
  const keyResultId = request.nextUrl.searchParams.get("keyResultId");
  const organizationId =
    request.nextUrl.searchParams.get("organizationId") ?? undefined;
  const repository = payload.repository?.full_name;
  const deliveryId = request.headers.get("x-github-delivery") ?? undefined;
  const baseBranch =
    request.nextUrl.searchParams.get("baseBranch") ??
    payload.pull_request?.base?.ref ??
    payload.repository?.default_branch ??
    null;

  if (!repository) {
    return NextResponse.json(
      { error: "GitHub webhook payload is missing repository.full_name" },
      { status: 400 },
    );
  }

  const { countMode, response: countModeResponse } = parsePullRequestCountMode(
    request.nextUrl.searchParams.get("countMode"),
  );

  if (countModeResponse) {
    return countModeResponse;
  }

  const integrations = await prisma.gitHubIntegration.findMany({
    where: {
      repository,
      organizationId,
      ...(keyResultId ? { keyResultId } : {}),
      OR: [{ branch: null }, ...(baseBranch ? [{ branch: baseBranch }] : [])],
    },
    select: {
      id: true,
      keyResultId: true,
      organizationId: true,
      branch: true,
      incrementBy: true,
      lastDeliveryId: true,
    },
  });

  if (integrations.length === 0) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "No GitHub integration is linked to this repository",
      repository,
      baseBranch,
    });
  }

  const mergedAtValue = payload.pull_request?.merged_at;
  const mergedAt = mergedAtValue ? new Date(mergedAtValue) : undefined;
  const mergedPullRequestUrl =
    payload.pull_request?.merged && payload.pull_request.html_url
      ? payload.pull_request.html_url
      : undefined;
  const syncResults = await Promise.all(
    integrations
      .filter((integration) => integration.lastDeliveryId !== deliveryId)
      .map(async (integration) => {
        const { prCount, result } = await syncGitHubIntegrationFromPrCount({
          integration,
          repository,
          countMode,
          accessToken: process.env.GITHUB_TOKEN,
          deliveryId,
          mergedPullRequestUrl,
          mergedAt,
        });

        if (!result.ok) {
          return {
            ok: false,
            integrationId: integration.id,
            keyResultId: integration.keyResultId,
          };
        }

        return {
          ok: true,
          integrationId: integration.id,
          keyResultId: integration.keyResultId,
          prCount,
          currentValue: result.keyResult.currentValue,
          objectiveProgress: result.objectiveProgress,
        } as const;
      }),
  );

  return NextResponse.json({
    ok: true,
    event: "pull_request",
    action: payload.action,
    repository,
    countMode,
    baseBranch,
    synced: syncResults,
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.searchParams.has("code")) {
    return handleOAuthCallback(request);
  }

  return handleOAuthStart(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const verification = verifyGitHubWebhookSignature(request, rawBody);

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");

  if (event === "ping") {
    return NextResponse.json({ ok: true, event });
  }

  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid GitHub webhook payload" },
      { status: 400 },
    );
  }

  return handlePullRequestWebhook(request, payload as GitHubWebhookPayload);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { user, response } = await requireCurrentUser();

  if (response) {
    return response;
  }

  const parsed = manualProgressUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid GitHub progress payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.organizationId) {
    const { response: organizationResponse } = await requireOrganizationAdmin(
      parsed.data.organizationId,
      user.id,
    );

    if (organizationResponse) {
      return organizationResponse;
    }
  }

  const result = await updateKeyResultProgressFromGithubPrCount(parsed.data);

  if (!result.ok) {
    return result.response;
  }

  return NextResponse.json({
    ok: true,
    keyResult: result.keyResult,
    objectiveProgress: result.objectiveProgress,
  });
}
