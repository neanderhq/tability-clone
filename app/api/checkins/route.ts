import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
});

const updateCheckInSchema = createCheckInSchema.partial().extend({
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

  const checkIns = await prisma.checkIn.findMany({
    where: {
      organizationId,
      objectiveId: searchParams.get("objectiveId") ?? undefined,
      keyResultId: searchParams.get("keyResultId") ?? undefined,
      authorId: searchParams.get("authorId") ?? undefined,
    },
    include: {
      author: true,
      objective: true,
      keyResult: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json({ checkIns });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const session = await auth();
  const parsed = createCheckInSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid check-in payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const author = session?.user?.email
    ? await prisma.user.findUnique({
        where: {
          email: session.user.email,
        },
      })
    : null;

  const checkIn = await prisma.checkIn.create({
    data: {
      ...parsed.data,
      authorId: author?.id,
    },
    include: {
      author: true,
      objective: true,
      keyResult: true,
    },
  });

  return NextResponse.json({ checkIn }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = updateCheckInSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid check-in payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;
  const checkIn = await prisma.checkIn.update({
    where: { id },
    data,
    include: {
      author: true,
      objective: true,
      keyResult: true,
    },
  });

  return NextResponse.json({ checkIn });
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

  await prisma.checkIn.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
