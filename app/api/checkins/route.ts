import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  OrganizationRole,
  type CheckIn,
  type CheckInConfidence,
  type ObjectiveStatus,
  type Prisma,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const checkInConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

const createCheckInSchema = z.object({
  note: z.string().optional(),
  confidence: checkInConfidenceSchema,
  progress: z.number().min(0).max(100).optional(),
  value: z.number().optional(),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  objectiveId: z.string().min(1).optional(),
  keyResultId: z.string().min(1).optional(),
  metricId: z.string().min(1).optional(),
});

const updateCheckInSchema = createCheckInSchema.partial().extend({
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

const checkInInclude = {
  author: true,
  objective: true,
  keyResult: true,
  metric: true,
} satisfies Prisma.CheckInInclude;

type CheckInContext = {
  organizationId: string;
  workspaceId?: string | null;
  objectiveId?: string | null;
  keyResultId?: string | null;
  metricId?: string | null;
};

function keyResultWhere(
  access: OrganizationAccess,
  user: CurrentUser,
): Prisma.KeyResultWhereInput {
  return {
    organizationId: access.organizationId,
    ...workspaceWhere(access),
    objective: objectiveWhere(access, user),
  };
}

function metricWhere(access: OrganizationAccess): Prisma.MetricWhereInput {
  return { organizationId: access.organizationId, ...workspaceWhere(access) };
}

async function validateCheckInContext(data: CheckInContext, user: CurrentUser) {
  const access = await findOrganizationAccess(data.organizationId, user);
  if (!access) return { response: notFound("Organization") };
  if (data.workspaceId && !access.workspaceIds.includes(data.workspaceId)) {
    return { response: notFound("Workspace") };
  }
  if (!data.objectiveId && !data.keyResultId && !data.metricId) {
    return {
      response: NextResponse.json(
        { error: "A check-in target is required" },
        { status: 400 },
      ),
    };
  }

  const objective = data.objectiveId
    ? await prisma.objective.findFirst({
        where: { id: data.objectiveId, ...objectiveWhere(access, user) },
      })
    : null;
  const keyResult = data.keyResultId
    ? await prisma.keyResult.findFirst({
        where: { id: data.keyResultId, ...keyResultWhere(access, user) },
        include: { objective: true },
      })
    : null;
  const metric = data.metricId
    ? await prisma.metric.findFirst({
        where: { id: data.metricId, ...metricWhere(access) },
      })
    : null;
  if (
    (data.objectiveId && !objective) ||
    (data.keyResultId && !keyResult) ||
    (data.metricId && !metric)
  ) {
    return { response: notFound("Check-in target") };
  }
  if (objective && keyResult && keyResult.objectiveId !== objective.id) {
    return {
      response: NextResponse.json(
        { error: "Key result does not belong to the objective" },
        { status: 400 },
      ),
    };
  }

  const targets = [
    objective,
    keyResult
      ? {
          ...keyResult,
          workspaceId: keyResult.workspaceId ?? keyResult.objective.workspaceId,
        }
      : null,
    metric,
  ].filter((target) => target !== null);
  const workspaceId = targets[0]?.workspaceId ?? null;
  if (
    targets.some((target) => target.workspaceId !== workspaceId) ||
    (data.workspaceId && data.workspaceId !== workspaceId) ||
    (keyResult?.workspaceId &&
      keyResult.workspaceId !== keyResult.objective.workspaceId)
  ) {
    return {
      response: NextResponse.json(
        { error: "Check-in targets must belong to the same workspace" },
        { status: 400 },
      ),
    };
  }
  // A key-result owner can check in on that result with its parent objective ID.
  const canManageKeyResult =
    !keyResult ||
    keyResult.ownerId === user.id ||
    canManageObjective(access, user, keyResult.objective);
  const canManage =
    canManageKeyResult &&
    (!objective ||
      (keyResult && keyResult.objectiveId === objective.id) ||
      canManageObjective(access, user, objective)) &&
    (!metric || access.isAdmin || metric.ownerId === user.id);

  return { access, workspaceId, canManage, response: null };
}

async function applyCheckIn(tx: Prisma.TransactionClient, checkIn: CheckIn) {
  if (checkIn.keyResultId) {
    const keyResult = await tx.keyResult.update({
      where: { id: checkIn.keyResultId },
      data: {
        currentValue: checkIn.value ?? undefined,
        confidence: checkIn.confidence,
      },
    });
    await updateObjectiveProgress(tx, keyResult.objectiveId);
  } else if (checkIn.objectiveId) {
    const objective = await tx.objective.findUniqueOrThrow({
      where: { id: checkIn.objectiveId },
    });
    const progress = checkIn.progress ?? objective.progress;
    await tx.objective.update({
      where: { id: objective.id },
      data: {
        progress,
        status:
          objective.status === "ARCHIVED"
            ? "ARCHIVED"
            : objectiveStatus(progress, [checkIn.confidence]),
      },
    });
  }
  if (checkIn.metricId && checkIn.value !== null) {
    await tx.metric.update({
      where: { id: checkIn.metricId },
      data: { currentValue: checkIn.value },
    });
  }
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
  const keyResultId = searchParams.get("keyResultId") ?? undefined;
  const metricId = searchParams.get("metricId") ?? undefined;
  if (objectiveId || keyResultId || metricId) {
    const context = await validateCheckInContext(
      { organizationId, workspaceId, objectiveId, keyResultId, metricId },
      user,
    );
    if (context.response) return context.response;
  }
  const checkIns = await prisma.checkIn.findMany({
    where: {
      organizationId,
      workspaceId,
      objectiveId,
      keyResultId,
      metricId,
      authorId: searchParams.get("authorId") ?? undefined,
      AND: [
        workspaceWhere(access),
        {
          OR: [
            { objectiveId: null },
            { objective: objectiveWhere(access, user) },
          ],
        },
        {
          OR: [
            { keyResultId: null },
            { keyResult: keyResultWhere(access, user) },
          ],
        },
        { OR: [{ metricId: null }, { metric: metricWhere(access) }] },
      ],
    },
    include: checkInInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ checkIns });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const parsed = createCheckInSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid check-in payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const context = await validateCheckInContext(parsed.data, user);
  if (context.response) return context.response;
  if (!context.canManage) return notFound("Check-in target");

  const checkIn = await prisma.$transaction(async (tx) => {
    const created = await tx.checkIn.create({
      data: {
        ...parsed.data,
        workspaceId: context.workspaceId,
        authorId: user.id,
      },
    });
    await applyCheckIn(tx, created);
    return tx.checkIn.findUniqueOrThrow({
      where: { id: created.id },
      include: checkInInclude,
    });
  });
  return NextResponse.json({ checkIn }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const parsed = updateCheckInSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid check-in payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { id, ...data } = parsed.data;
  const existing = await prisma.checkIn.findUnique({ where: { id } });
  if (!existing) return notFound("Check-in");
  const existingContext = await validateCheckInContext(existing, user);
  if (
    existingContext.response ||
    (!existingContext.canManage && existing.authorId !== user.id)
  )
    return notFound("Check-in");
  const context = await validateCheckInContext({ ...existing, ...data }, user);
  if (context.response) return context.response;
  const changingTarget = [
    "organizationId",
    "workspaceId",
    "objectiveId",
    "keyResultId",
    "metricId",
  ].some(
    (field) =>
      field in data &&
      data[field as keyof typeof data] !== existing[field as keyof CheckIn],
  );
  if (changingTarget && !context.canManage) return notFound("Check-in target");

  const checkIn = await prisma.$transaction(async (tx) => {
    const updated = await tx.checkIn.update({
      where: { id },
      data: { ...data, workspaceId: context.workspaceId },
    });
    await applyCheckIn(tx, updated);
    return tx.checkIn.findUniqueOrThrow({
      where: { id },
      include: checkInInclude,
    });
  });
  return NextResponse.json({ checkIn });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  const existing = await prisma.checkIn.findUnique({ where: { id } });
  if (!existing) return notFound("Check-in");
  const context = await validateCheckInContext(existing, user);
  if (context.response || (!context.canManage && existing.authorId !== user.id))
    return notFound("Check-in");
  await prisma.checkIn.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
