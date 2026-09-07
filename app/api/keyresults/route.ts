import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const keyResultTypeSchema = z.enum([
  "NUMBER",
  "PERCENTAGE",
  "CURRENCY",
  "BOOLEAN",
]);
const checkInConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

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
});

const updateKeyResultSchema = createKeyResultSchema.partial().extend({
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

  const keyResults = await prisma.keyResult.findMany({
    where: {
      organizationId,
      objectiveId: searchParams.get("objectiveId") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
    },
    include: {
      owner: true,
      objective: true,
      workspace: true,
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

  return NextResponse.json({ keyResults });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const session = await auth();
  const parsed = createKeyResultSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid key result payload", details: parsed.error.flatten() },
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

  const keyResult = await prisma.keyResult.create({
    data: {
      ...parsed.data,
      ownerId: parsed.data.ownerId ?? owner?.id,
    },
    include: {
      owner: true,
      objective: true,
      workspace: true,
    },
  });

  return NextResponse.json({ keyResult }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = updateKeyResultSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid key result payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;
  const keyResult = await prisma.keyResult.update({
    where: { id },
    data,
    include: {
      owner: true,
      objective: true,
      workspace: true,
    },
  });

  return NextResponse.json({ keyResult });
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

  await prisma.keyResult.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
