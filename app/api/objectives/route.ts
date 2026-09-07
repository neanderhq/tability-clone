import { NextRequest, NextResponse } from "next/server";
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

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  level: objectiveLevelSchema.optional(),
  status: objectiveStatusSchema.optional(),
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

async function requireSession() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const { searchParams } = request.nextUrl;
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  const objectives = await prisma.objective.findMany({
    where: {
      organizationId,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      cycleId: searchParams.get("cycleId") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
      status: objectiveStatusSchema.safeParse(searchParams.get("status"))
        .success
        ? objectiveStatusSchema.parse(searchParams.get("status"))
        : undefined,
    },
    include: {
      owner: true,
      workspace: true,
      cycle: true,
      keyResults: true,
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
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const session = await auth();
  const parsed = createObjectiveSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid objective payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const creator = session?.user?.email
    ? await prisma.user.findUnique({
        where: {
          email: session.user.email,
        },
      })
    : null;

  const objective = await prisma.objective.create({
    data: {
      ...parsed.data,
      creatorId: creator?.id,
    },
    include: {
      keyResults: true,
      owner: true,
      workspace: true,
      cycle: true,
    },
  });

  return NextResponse.json({ objective }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = updateObjectiveSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid objective payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;
  const objective = await prisma.objective.update({
    where: { id },
    data,
    include: {
      keyResults: true,
      owner: true,
      workspace: true,
      cycle: true,
    },
  });

  return NextResponse.json({ objective });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.objective.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
