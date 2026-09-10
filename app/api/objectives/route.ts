import { NextRequest, NextResponse } from "next/server";
import {
  ObjectiveVisibility,
  OrganizationRole,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const objectiveLevelSchema = z.enum(["COMPANY", "TEAM", "INDIVIDUAL"]);
const objectiveStatusSchema = z.enum([
  "NOT_STARTED",
  "ON_TRACK",
  "AT_RISK",
  "OFF_TRACK",
  "COMPLETED",
  "ARCHIVED",
]);
const objectiveVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  level: objectiveLevelSchema.optional(),
  status: objectiveStatusSchema.optional(),
  visibility: objectiveVisibilitySchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  dueDate: z.coerce.date().optional(),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  cycleId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  parentObjectiveId: z.string().min(1).optional(),
});

const updateObjectiveSchema = createObjectiveSchema.partial().extend({
  id: z.string().min(1),
});

type CurrentUser = {
  id: string;
  email: string;
  role: OrganizationRole;
};

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

async function findOrganizationAccess(organizationId: string, userId: string) {
  return prisma.organization.findFirst({
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
    include: {
      workspaces: {
        where: {
          OR: [
            { leadId: userId },
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
        },
        orderBy: {
          updatedAt: "desc",
        },
      },
    },
  });
}

function isOrganizationAdmin(
  user: CurrentUser,
  organization: { ownerId?: string | null },
) {
  return organization.ownerId === user.id || user.role === OrganizationRole.ADMIN;
}

async function resolveWorkspaceId({
  organizationId,
  requestedWorkspaceId,
  user,
  requireWorkspace,
}: {
  organizationId: string;
  requestedWorkspaceId?: string;
  user: CurrentUser;
  requireWorkspace: boolean;
}) {
  const organization = await findOrganizationAccess(organizationId, user.id);

  if (!organization) {
    return {
      workspaceId: null,
      response: NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      ),
    };
  }

  const isAdmin = isOrganizationAdmin(user, organization);

  if (requestedWorkspaceId) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: requestedWorkspaceId,
        organizationId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { leadId: user.id },
                {
                  members: {
                    some: {
                      id: user.id,
                    },
                  },
                },
              ],
            }),
      },
      select: {
        id: true,
      },
    });

    if (!workspace) {
      return {
        workspaceId: null,
        response: NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 },
        ),
      };
    }

    return { workspaceId: workspace.id, response: null };
  }

  if (isAdmin) {
    return { workspaceId: undefined, response: null };
  }

  const defaultWorkspaceId = organization.workspaces[0]?.id;

  if (defaultWorkspaceId) {
    return { workspaceId: defaultWorkspaceId, response: null };
  }

  if (!requireWorkspace) {
    return { workspaceId: undefined, response: null };
  }

  return {
    workspaceId: null,
    response: NextResponse.json(
      { error: "Workspace access is required" },
      { status: 403 },
    ),
  };
}

function visibleObjectiveWhere(
  user: CurrentUser,
  canViewPrivate: boolean,
): Prisma.ObjectiveWhereInput {
  if (canViewPrivate) {
    return {};
  }

  return {
    OR: [
      { visibility: ObjectiveVisibility.PUBLIC },
      {
        visibility: ObjectiveVisibility.PRIVATE,
        OR: [{ ownerId: user.id }, { creatorId: user.id }],
      },
    ],
  };
}

function canManageObjective(
  user: CurrentUser,
  organization: { ownerId?: string | null },
  objective: { ownerId?: string | null; creatorId?: string | null },
) {
  return (
    isOrganizationAdmin(user, organization) ||
    objective.ownerId === user.id ||
    objective.creatorId === user.id
  );
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const { searchParams } = request.nextUrl;
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  const requestedWorkspaceId = searchParams.get("workspaceId") ?? undefined;
  const workspaceScope = await resolveWorkspaceId({
    organizationId,
    requestedWorkspaceId,
    user,
    requireWorkspace: false,
  });

  if (workspaceScope.response) {
    return workspaceScope.response;
  }

  const organizationAccess = await findOrganizationAccess(
    organizationId,
    user.id,
  );
  const canViewPrivate = organizationAccess
    ? isOrganizationAdmin(user, organizationAccess)
    : false;

  const objectives = await prisma.objective.findMany({
    where: {
      organizationId,
      workspaceId: workspaceScope.workspaceId ?? undefined,
      cycleId: searchParams.get("cycleId") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
      visibility: objectiveVisibilitySchema.safeParse(
        searchParams.get("visibility"),
      ).success
        ? objectiveVisibilitySchema.parse(searchParams.get("visibility"))
        : undefined,
      status: objectiveStatusSchema.safeParse(searchParams.get("status"))
        .success
        ? objectiveStatusSchema.parse(searchParams.get("status"))
        : undefined,
      ...visibleObjectiveWhere(user, canViewPrivate),
    },
    include: {
      owner: true,
      workspace: true,
      cycle: true,
      keyResults: { include: { githubIntegration: true } },
      childObjectives: true,
      _count: {
        select: {
          checkIns: true,
          tasks: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return NextResponse.json({ objectives });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const parsed = createObjectiveSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid objective payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const workspaceScope = await resolveWorkspaceId({
    organizationId: parsed.data.organizationId,
    requestedWorkspaceId: parsed.data.workspaceId,
    user,
    requireWorkspace: parsed.data.level !== "COMPANY",
  });

  if (workspaceScope.response) {
    return workspaceScope.response;
  }

  const data = parsed.data;
  const objective = await prisma.objective.create({
    data: {
      ...data,
      visibility: data.visibility ?? ObjectiveVisibility.PUBLIC,
      workspaceId: workspaceScope.workspaceId,
      creatorId: user.id,
      ownerId: data.ownerId ?? user.id,
    },
    include: {
      keyResults: { include: { githubIntegration: true } },
      owner: true,
      workspace: true,
      cycle: true,
    },
  });

  return NextResponse.json({ objective }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const parsed = updateObjectiveSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid objective payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existingObjective = await prisma.objective.findUnique({
    where: {
      id: parsed.data.id,
    },
  });

  if (!existingObjective) {
    return NextResponse.json({ error: "Objective not found" }, { status: 404 });
  }

  const organizationAccess = await findOrganizationAccess(
    existingObjective.organizationId,
    user.id,
  );

  if (
    !organizationAccess ||
    !canManageObjective(user, organizationAccess, existingObjective)
  ) {
    return NextResponse.json({ error: "Objective not found" }, { status: 404 });
  }

  const requestedWorkspaceId =
    parsed.data.workspaceId ?? existingObjective.workspaceId ?? undefined;
  const nextLevel = parsed.data.level ?? existingObjective.level;
  const workspaceScope = await resolveWorkspaceId({
    organizationId: parsed.data.organizationId ?? existingObjective.organizationId,
    requestedWorkspaceId,
    user,
    requireWorkspace: nextLevel !== "COMPANY",
  });

  if (workspaceScope.response) {
    return workspaceScope.response;
  }

  const { id, ...data } = parsed.data;
  const objective = await prisma.objective.update({
    where: { id },
    data: {
      ...data,
      workspaceId: workspaceScope.workspaceId,
    },
    include: {
      keyResults: { include: { githubIntegration: true } },
      owner: true,
      workspace: true,
      cycle: true,
    },
  });

  return NextResponse.json({ objective });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existingObjective = await prisma.objective.findUnique({
    where: {
      id,
    },
  });

  if (!existingObjective) {
    return NextResponse.json({ error: "Objective not found" }, { status: 404 });
  }

  const organizationAccess = await findOrganizationAccess(
    existingObjective.organizationId,
    user.id,
  );

  if (
    !organizationAccess ||
    !canManageObjective(user, organizationAccess, existingObjective)
  ) {
    return NextResponse.json({ error: "Objective not found" }, { status: 404 });
  }

  await prisma.objective.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
