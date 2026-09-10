import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const metricTypeSchema = z.enum(["NUMBER", "PERCENTAGE", "CURRENCY"]);
const checkInCadenceSchema = z.enum(["NONE", "WEEKLY"]);

const createMetricSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: metricTypeSchema.default("NUMBER"),
  currentValue: z.number().optional(),
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  checkInCadence: checkInCadenceSchema.optional(),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
});

const updateMetricSchema = createMetricSchema.partial().extend({
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

  const metrics = await prisma.metric.findMany({
    where: {
      organizationId,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
      type: metricTypeSchema.safeParse(searchParams.get("type")).success
        ? metricTypeSchema.parse(searchParams.get("type"))
        : undefined,
    },
    include: {
      owner: true,
      workspace: true,
      _count: {
        select: {
          checkIns: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return NextResponse.json({ metrics });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const session = await auth();
  const parsed = createMetricSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid metric payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const owner = session?.user?.email
    ? await prisma.user.findUnique({
        where: {
          email: session.user.email,
        },
      })
    : null;

  const metric = await prisma.metric.create({
    data: {
      ...parsed.data,
      ownerId: parsed.data.ownerId ?? owner?.id,
    },
    include: {
      owner: true,
      workspace: true,
    },
  });

  return NextResponse.json({ metric }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = updateMetricSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid metric payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;
  const metric = await prisma.metric.update({
    where: { id },
    data,
    include: {
      owner: true,
      workspace: true,
    },
  });

  return NextResponse.json({ metric });
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

  await prisma.metric.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
