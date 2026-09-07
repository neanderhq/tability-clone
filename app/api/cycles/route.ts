import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const cycleStatusSchema = z.enum(["PLANNED", "ACTIVE", "CLOSED"]);

const createCycleSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  status: cycleStatusSchema.optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
});

const updateCycleSchema = createCycleSchema.partial().extend({
  id: z.string().min(1),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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

  const cycles = await prisma.cycle.findMany({
    where: {
      organizationId,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      status: cycleStatusSchema.safeParse(searchParams.get("status")).success
        ? cycleStatusSchema.parse(searchParams.get("status"))
        : undefined,
    },
    include: {
      workspace: true,
      _count: {
        select: {
          objectives: true,
        },
      },
    },
    orderBy: {
      startsAt: "desc",
    },
  });

  return NextResponse.json({ cycles });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = createCycleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid cycle payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cycle = await prisma.cycle.create({
    data: {
      ...parsed.data,
      slug: parsed.data.slug ?? slugify(parsed.data.name),
    },
  });

  return NextResponse.json({ cycle }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = updateCycleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid cycle payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;
  const cycle = await prisma.cycle.update({
    where: { id },
    data: {
      ...data,
      slug: data.slug ?? (data.name ? slugify(data.name) : undefined),
    },
  });

  return NextResponse.json({ cycle });
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

  await prisma.cycle.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
