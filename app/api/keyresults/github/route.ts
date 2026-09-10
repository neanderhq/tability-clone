import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const pullRequestWebhookSchema = z
  .object({
    action: z.string(),
    repository: z.object({
      full_name: z.string(),
    }),
    pull_request: z.object({
      merged: z.boolean().optional(),
      html_url: z.string().optional(),
      merged_at: z.string().nullable().optional(),
      base: z
        .object({
          ref: z.string().optional(),
        })
        .optional(),
    }),
  })
  .passthrough();

function verifyGitHubSignature(rawBody: string, signature: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    return { ok: false, error: "GitHub webhook secret is not configured" };
  }

  if (!signature) {
    return { ok: false, error: "Missing GitHub webhook signature" };
  }

  const expected = `sha256=${createHmac("sha256", secret)
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

function parseMergedAt(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function nextCurrentValue(currentValue: number, targetValue: number, incrementBy: number) {
  const nextValue = currentValue + incrementBy;

  return targetValue > currentValue ? Math.min(nextValue, targetValue) : nextValue;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verification = verifyGitHubSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
  );

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");

  if (eventName === "ping") {
    return NextResponse.json({ ok: true, ignored: false, reason: "ping" });
  }

  if (eventName !== "pull_request") {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "unsupported_event",
    });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = pullRequestWebhookSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid pull request payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const pullRequest = parsed.data.pull_request;

  if (parsed.data.action !== "closed" || !pullRequest.merged) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "pull_request_not_merged",
    });
  }

  const repository = parsed.data.repository.full_name;
  const branch = pullRequest.base?.ref;
  const deliveryId = request.headers.get("x-github-delivery") ?? undefined;
  const integrations = await prisma.gitHubIntegration.findMany({
    where: {
      repository: {
        equals: repository,
        mode: "insensitive",
      },
      ...(deliveryId
        ? {
            NOT: {
              lastDeliveryId: deliveryId,
            },
          }
        : {}),
      OR: [
        { branch: null },
        { branch: "" },
        ...(branch
          ? [
              {
                branch: {
                  equals: branch,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    include: {
      keyResult: {
        select: {
          id: true,
          currentValue: true,
          targetValue: true,
        },
      },
    },
  });
  const mergedAt = parseMergedAt(pullRequest.merged_at);
  const operations = integrations.flatMap((integration) => [
    prisma.keyResult.update({
      where: {
        id: integration.keyResultId,
      },
      data: {
        currentValue: nextCurrentValue(
          integration.keyResult.currentValue,
          integration.keyResult.targetValue,
          integration.incrementBy,
        ),
      },
    }),
    prisma.gitHubIntegration.update({
      where: {
        id: integration.id,
      },
      data: {
        lastDeliveryId: deliveryId,
        lastMergedPullRequestUrl: pullRequest.html_url,
        lastMergedAt: mergedAt,
      },
    }),
  ]);

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  return NextResponse.json({
    ok: true,
    ignored: false,
    repository,
    branch,
    updated: integrations.length,
  });
}
