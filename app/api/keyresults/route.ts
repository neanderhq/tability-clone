import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  OrganizationRole,
  type CheckInConfidence,
  type ObjectiveStatus,
  type Prisma,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const keyResultTypeSchema = z.enum([
  "NUMBER",
  "PERCENTAGE",
  "CURRENCY",
  "BOOLEAN",
]);
const checkInConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

const gitHubIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  repository: z.string().optional(),
  branch: z.string().optional(),
  incrementBy: z.number().positive().optional(),
});

const createKeyResultSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: keyResultTypeSchema.default("NUMBER"),
  startValue: z.number().optional(),
  targetValue: z.number(),
  currentValue: z.number().optional(),
  unit: z.string().optional(),
  confidence: checkInConfidenceSchema.optional(),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  objectiveId: z.string().min(1),
  ownerId: z.string().min(1).optional(),
  gitHubIntegration: gitHubIntegrationSchema.optional(),
});

const updateKeyResultSchema = createKeyResultSchema.partial().extend({
  id: z.string().min(1),
});

type CurrentUser = { id: string; role: OrganizationRole };

async function requireCurrentUser() {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, role: true },
      })
    : null;

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null };
}

async function findOrganizationAccess(
  organizationId: string,
  user: CurrentUser,
) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      OR: [{ ownerId: user.id }, { members: { some: { id: user.id } } }],
    },
  });

  if (!organization) {
    return null;
  }

  const isAdmin =
    organization.ownerId === user.id || user.role === OrganizationRole.ADMIN;
  const workspaces = await prisma.workspace.findMany({
    where: {
      organizationId,
      ...(isAdmin
        ? {}
        : {
            OR: [{ leadId: user.id }, { members: { some: { id: user.id } } }],
          }),
    },
    select: { id: true },
  });

  return {
    organizationId,
    isAdmin,
    workspaceIds: workspaces.map((workspace) => workspace.id),
  };
}

type OrganizationAccess = NonNullable<
  Awaited<ReturnType<typeof findOrganizationAccess>>
>;

function workspaceWhere(access: OrganizationAccess) {
  return {
    OR: [{ workspaceId: null }, { workspaceId: { in: access.workspaceIds } }],
  };
}

function objectiveWhere(
  access: OrganizationAccess,
  user: CurrentUser,
): Prisma.ObjectiveWhereInput {
  return {
    organizationId: access.organizationId,
    AND: [
      workspaceWhere(access),
      ...(access.isAdmin
        ? []
        : [
            {
              OR: [
                { visibility: "PUBLIC" as const },
                { ownerId: user.id },
                { creatorId: user.id },
              ],
            },
          ]),
    ],
  };
}

function canManageObjective(
  access: OrganizationAccess,
  user: CurrentUser,
  objective: { ownerId: string | null; creatorId: string | null },
) {
  return (
    access.isAdmin ||
    objective.ownerId === user.id ||
    objective.creatorId === user.id
  );
}

function notFound(resource: string) {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

function objectiveStatus(
  progress: number,
  confidences: (CheckInConfidence | null)[],
): ObjectiveStatus {
  if (progress >= 100) return "COMPLETED";
  if (progress <= 0) return "NOT_STARTED";
  const hasLowConfidence = confidences.includes("LOW");
  const hasMediumConfidence = confidences.some(
    (confidence) => !confidence || confidence === "MEDIUM",
  );
  if (hasLowConfidence && progress < 50) return "OFF_TRACK";
  if (
    progress < 50 ||
    hasLowConfidence ||
    (hasMediumConfidence && progress < 60)
  )
    return "AT_RISK";
  return "ON_TRACK";
}

async function updateObjectiveProgress(
  tx: Prisma.TransactionClient,
  objectiveId: string,
) {
  const objective = await tx.objective.findUniqueOrThrow({
    where: { id: objectiveId },
    include: { keyResults: true },
  });
  const progress = objective.keyResults.length
    ? Math.round(
        objective.keyResults.reduce((total, keyResult) => {
          const range = keyResult.targetValue - keyResult.startValue;
          const value =
            keyResult.type === "BOOLEAN" || range === 0
              ? keyResult.currentValue >= keyResult.targetValue
                ? 100
                : 0
              : Math.round(
                  Math.min(
                    100,
                    Math.max(
                      0,
                      ((keyResult.currentValue - keyResult.startValue) /
                        range) *
                        100,
                    ),
                  ),
                );
          return total + value;
        }, 0) / objective.keyResults.length,
      )
    : 0;

  await tx.objective.update({
    where: { id: objectiveId },
    data: {
      progress,
      status:
        objective.status === "ARCHIVED"
          ? "ARCHIVED"
          : objectiveStatus(
              progress,
              objective.keyResults.map((keyResult) => keyResult.confidence),
            ),
    },
  });
}

function normalizeGitHubRepository(repository?: string) {
  const normalized = repository
    ?.trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    return null;
  }

  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)
    ? normalized
    : null;
}

function normalizeGitHubIntegration(
  integration?: z.infer<typeof gitHubIntegrationSchema>,
) {
  if (!integration || !integration.enabled) {
    return { enabled: false as const };
  }

  const repository = normalizeGitHubRepository(integration.repository);

  if (!repository) {
    return {
      enabled: true as const,
      error: "GitHub repository must use owner/repo format",
    };
  }

  return {
    enabled: true as const,
    repository,
    branch: integration.branch?.trim() || null,
    incrementBy: integration.incrementBy ?? 1,
  };
}

async function syncGitHubIntegration(
  tx: Prisma.TransactionClient,
  {
    keyResultId,
    organizationId,
    workspaceId,
    integration,
  }: {
    keyResultId: string;
    organizationId: string;
    workspaceId?: string | null;
    integration?: z.infer<typeof gitHubIntegrationSchema>;
  },
) {
  const normalized = normalizeGitHubIntegration(integration);

  if (!normalized.enabled) {
    await tx.gitHubIntegration.deleteMany({
      where: {
        keyResultId,
      },
    });
    return null;
  }

  if ("error" in normalized) {
    return normalized.error;
  }

  await tx.gitHubIntegration.upsert({
    where: {
      keyResultId,
    },
    update: {
      repository: normalized.repository,
      branch: normalized.branch,
      incrementBy: normalized.incrementBy,
      organizationId,
      workspaceId,
    },
    create: {
      keyResultId,
      repository: normalized.repository,
      branch: normalized.branch,
      incrementBy: normalized.incrementBy,
      organizationId,
      workspaceId,
    },
  });

  return null;
}

const keyResultInclude = {
  owner: true,
  objective: true,
  workspace: true,
  githubIntegration: true,
} satisfies Prisma.KeyResultInclude;

async function validateKeyResultContext(
  data: {
    organizationId: string;
    objectiveId: string;
    workspaceId?: string | null;
    ownerId?: string | null;
  },
  user: CurrentUser,
  requireObjectiveOwnership: boolean,
) {
  const access = await findOrganizationAccess(data.organizationId, user);
  if (!access) return { response: notFound("Organization") };

  const objective = await prisma.objective.findFirst({
    where: { id: data.objectiveId, ...objectiveWhere(access, user) },
  });
  if (
    !objective ||
    (requireObjectiveOwnership && !canManageObjective(access, user, objective))
  ) {
    return { response: notFound("Objective") };
  }

  const workspaceId = data.workspaceId ?? objective.workspaceId;
  if (
    workspaceId !== objective.workspaceId ||
    (workspaceId && !access.workspaceIds.includes(workspaceId))
  ) {
    return { response: notFound("Workspace") };
  }
  if (data.ownerId) {
    const ownerAccess = await prisma.organization.findFirst({
      where: {
        id: data.organizationId,
        OR: [
          { ownerId: data.ownerId },
          { members: { some: { id: data.ownerId } } },
        ],
      },
      select: { id: true },
    });
    if (!ownerAccess) return { response: notFound("Owner") };
  }

  return { access, objective, workspaceId, response: null };
}

async function findManageableKeyResult(id: string, user: CurrentUser) {
  const keyResult = await prisma.keyResult.findUnique({ where: { id } });
  if (!keyResult) return null;
  const context = await validateKeyResultContext(keyResult, user, false);
  if (context.response || !context.access || !context.objective) return null;
  return keyResult.ownerId === user.id ||
    canManageObjective(context.access, user, context.objective)
    ? keyResult
    : null;
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const { searchParams } = request.nextUrl;
  const organizationId = searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }
  const access = await findOrganizationAccess(organizationId, user);
  if (!access) return notFound("Organization");
  const workspaceId = searchParams.get("workspaceId") ?? undefined;
  if (workspaceId && !access.workspaceIds.includes(workspaceId))
    return notFound("Workspace");
  const objectiveId = searchParams.get("objectiveId") ?? undefined;
  if (
    objectiveId &&
    !(await prisma.objective.findFirst({
      where: { id: objectiveId, ...objectiveWhere(access, user) },
    }))
  ) {
    return notFound("Objective");
  }

  const keyResults = await prisma.keyResult.findMany({
    where: {
      organizationId,
      objectiveId,
      workspaceId,
      ownerId: searchParams.get("ownerId") ?? undefined,
      AND: [workspaceWhere(access)],
      objective: objectiveWhere(access, user),
    },
    include: {
      ...keyResultInclude,
      _count: { select: { checkIns: true, tasks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ keyResults });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const parsed = createKeyResultSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid key result payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { gitHubIntegration, ...data } = parsed.data;
  const normalized = normalizeGitHubIntegration(gitHubIntegration);
  if ("error" in normalized)
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  const context = await validateKeyResultContext(
    { ...data, ownerId: data.ownerId ?? user.id },
    user,
    true,
  );
  if (context.response) return context.response;

  const keyResult = await prisma.$transaction(async (tx) => {
    const created = await tx.keyResult.create({
      data: {
        ...data,
        workspaceId: context.workspaceId,
        ownerId: data.ownerId ?? user.id,
      },
    });
    if (gitHubIntegration) {
      await syncGitHubIntegration(tx, {
        ...created,
        keyResultId: created.id,
        integration: gitHubIntegration,
      });
    }
    await updateObjectiveProgress(tx, created.objectiveId);
    return tx.keyResult.findUniqueOrThrow({
      where: { id: created.id },
      include: keyResultInclude,
    });
  });
  return NextResponse.json({ keyResult }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const parsed = updateKeyResultSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid key result payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { id, gitHubIntegration, ...data } = parsed.data;
  const existing = await findManageableKeyResult(id, user);
  if (!existing) return notFound("Key result");
  const normalized = normalizeGitHubIntegration(gitHubIntegration);
  if ("error" in normalized)
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  const moving =
    data.objectiveId !== undefined && data.objectiveId !== existing.objectiveId;
  const context = await validateKeyResultContext(
    {
      ...existing,
      ...data,
      workspaceId:
        data.workspaceId ?? (moving ? undefined : existing.workspaceId),
    },
    user,
    moving,
  );
  if (context.response) return context.response;
  // Existing check-ins share this organization and cannot be transferred independently.
  if (data.organizationId && data.organizationId !== existing.organizationId) {
    return NextResponse.json(
      { error: "Key results cannot move between organizations" },
      { status: 400 },
    );
  }

  const keyResult = await prisma.$transaction(async (tx) => {
    const updated = await tx.keyResult.update({
      where: { id },
      data: { ...data, workspaceId: context.workspaceId },
    });
    if (gitHubIntegration) {
      await syncGitHubIntegration(tx, {
        ...updated,
        keyResultId: id,
        integration: gitHubIntegration,
      });
    } else {
      await tx.gitHubIntegration.updateMany({
        where: { keyResultId: id },
        data: {
          organizationId: updated.organizationId,
          workspaceId: updated.workspaceId,
        },
      });
    }
    await updateObjectiveProgress(tx, updated.objectiveId);
    if (existing.objectiveId !== updated.objectiveId)
      await updateObjectiveProgress(tx, existing.objectiveId);
    return tx.keyResult.findUniqueOrThrow({
      where: { id },
      include: keyResultInclude,
    });
  });
  return NextResponse.json({ keyResult });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  const existing = await findManageableKeyResult(id, user);
  if (!existing) return notFound("Key result");
  await prisma.$transaction(async (tx) => {
    await tx.keyResult.delete({ where: { id } });
    await updateObjectiveProgress(tx, existing.objectiveId);
  });
  return NextResponse.json({ ok: true });
}
