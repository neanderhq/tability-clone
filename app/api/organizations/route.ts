import { NextRequest, NextResponse } from "next/server";
import { OrganizationRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const organizationRoleSchema = z.enum(["ADMIN", "MEMBER"]);

const inviteUserSchema = z.object({
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  role: organizationRoleSchema.default("MEMBER"),
});

const updateMemberRoleSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: organizationRoleSchema,
});

type OrganizationWithAccess = Prisma.OrganizationGetPayload<{
  include: {
    members: {
      select: {
        id: true;
        email: true;
        name: true;
        role: true;
      };
    };
    workspaces: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

function isOrganizationAdmin(
  user: { id: string; role: OrganizationRole },
  organization: { ownerId?: string | null },
) {
  return organization.ownerId === user.id || user.role === OrganizationRole.ADMIN;
}

function serializeOrganization(
  organization: OrganizationWithAccess,
  user: { id: string; role: OrganizationRole },
) {
  const currentUserRole = isOrganizationAdmin(user, organization)
    ? OrganizationRole.ADMIN
    : OrganizationRole.MEMBER;

  return {
    ...organization,
    currentUserRole,
    members:
      currentUserRole === OrganizationRole.ADMIN ? organization.members : [],
    workspaces:
      currentUserRole === OrganizationRole.ADMIN ? organization.workspaces : [],
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
  });

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null };
}

async function findOrganizationForUser(organizationId: string, userId: string) {
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
      members: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
        orderBy: {
          name: "asc",
        },
      },
      workspaces: {
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
  });
}

export async function GET() {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        {
          members: {
            some: {
              id: user.id,
            },
          },
        },
      ],
    },
    include: {
      members: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
        orderBy: {
          name: "asc",
        },
      },
      workspaces: {
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return NextResponse.json({
    organizations: organizations.map((organization) =>
      serializeOrganization(organization, user),
    ),
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const parsed = inviteUserSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invite payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const organization = await findOrganizationForUser(
    parsed.data.organizationId,
    user.id,
  );

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!isOrganizationAdmin(user, organization)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workspace = organization.workspaces.find(
    (item) => item.id === parsed.data.workspaceId,
  );

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const email = parsed.data.email.toLowerCase();
  const invitedUser = await prisma.user.upsert({
    where: {
      email,
    },
    update: {
      name: parsed.data.name?.trim() || undefined,
      ...(parsed.data.role === "ADMIN"
        ? { role: OrganizationRole.ADMIN }
        : {}),
    },
    create: {
      email,
      name: parsed.data.name?.trim() || email.split("@")[0],
      role:
        parsed.data.role === "ADMIN"
          ? OrganizationRole.ADMIN
          : OrganizationRole.MEMBER,
    },
  });

  await prisma.organization.update({
    where: {
      id: organization.id,
    },
    data: {
      members: {
        connect: {
          id: invitedUser.id,
        },
      },
    },
  });

  await prisma.workspace.update({
    where: {
      id: workspace.id,
    },
    data: {
      members: {
        connect: {
          id: invitedUser.id,
        },
      },
    },
  });

  const updatedOrganization = await findOrganizationForUser(
    organization.id,
    user.id,
  );

  return NextResponse.json(
    {
      organization: updatedOrganization
        ? serializeOrganization(updatedOrganization, user)
        : null,
      user: invitedUser,
    },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCurrentUser();

  if (response || !user) {
    return response;
  }

  const parsed = updateMemberRoleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid role payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const organization = await findOrganizationForUser(
    parsed.data.organizationId,
    user.id,
  );

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!isOrganizationAdmin(user, organization)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    organization.ownerId === parsed.data.userId &&
    parsed.data.role !== OrganizationRole.ADMIN
  ) {
    return NextResponse.json(
      { error: "Organization owner must remain an admin" },
      { status: 400 },
    );
  }

  const member = organization.members.find(
    (item) => item.id === parsed.data.userId,
  );

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: {
      id: parsed.data.userId,
    },
    data: {
      role: parsed.data.role,
    },
  });

  const updatedOrganization = await findOrganizationForUser(
    organization.id,
    user.id,
  );

  return NextResponse.json({
    organization: updatedOrganization
      ? serializeOrganization(updatedOrganization, user)
      : null,
  });
}
