import {
  CheckInConfidence,
  CycleStatus,
  KeyResultType,
  ObjectiveLevel,
  ObjectiveStatus,
  OrganizationRole,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

const users = [
  {
    id: "demo_user_primary",
    email: "demo@example.com",
    name: "Demo User",
    role: OrganizationRole.ADMIN,
  },
  {
    id: "demo_user_alex",
    email: "alex@demo.local",
    name: "Alex Morgan",
    role: OrganizationRole.ADMIN,
  },
  {
    id: "demo_user_jamie",
    email: "jamie@demo.local",
    name: "Jamie Chen",
    role: OrganizationRole.MEMBER,
  },
  {
    id: "demo_user_priya",
    email: "priya@demo.local",
    name: "Priya Shah",
    role: OrganizationRole.MEMBER,
  },
];

const organization = {
  id: "demo_org_acme",
  name: "Acme Demo",
  slug: "acme-demo",
  ownerId: "demo_user_primary",
};

const workspace = {
  id: "demo_workspace_growth",
  name: "Growth Team",
  slug: "growth-team",
  description: "Demo workspace for OKR planning and weekly check-ins.",
  organizationId: organization.id,
  leadId: "demo_user_jamie",
};

const cycles = [
  {
    id: "demo_cycle_active",
    name: "Q3 2026",
    slug: "q3-2026",
    status: CycleStatus.ACTIVE,
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-09-30T23:59:59.000Z"),
  },
  {
    id: "demo_cycle_closed",
    name: "Q2 2026",
    slug: "q2-2026",
    status: CycleStatus.CLOSED,
    startsAt: new Date("2026-04-01T00:00:00.000Z"),
    endsAt: new Date("2026-06-30T23:59:59.000Z"),
  },
];

const objectives = [
  {
    id: "demo_obj_01",
    title: "Increase self-serve activation",
    description: "Help new accounts reach first value faster.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.ON_TRACK,
    progress: 72,
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_jamie",
  },
  {
    id: "demo_obj_02",
    title: "Improve expansion pipeline quality",
    description: "Focus the revenue team on qualified expansion opportunities.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.AT_RISK,
    progress: 48,
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_alex",
  },
  {
    id: "demo_obj_03",
    title: "Launch weekly customer health review",
    description: "Build a reliable operating rhythm for customer health.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.ON_TRACK,
    progress: 64,
    dueDate: new Date("2026-09-20T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_priya",
  },
  {
    id: "demo_obj_04",
    title: "Reduce onboarding time",
    description: "Shorten the path from signup to configured workspace.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.ON_TRACK,
    progress: 58,
    dueDate: new Date("2026-09-25T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_jamie",
  },
  {
    id: "demo_obj_05",
    title: "Strengthen enterprise readiness",
    description: "Close reliability and security gaps for larger customers.",
    level: ObjectiveLevel.COMPANY,
    status: ObjectiveStatus.AT_RISK,
    progress: 42,
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_alex",
  },
  {
    id: "demo_obj_06",
    title: "Grow product-qualified leads",
    description: "Increase qualified intent from product usage.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.ON_TRACK,
    progress: 81,
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_priya",
  },
  {
    id: "demo_obj_07",
    title: "Improve dashboard engagement",
    description: "Make weekly OKR review easier for managers.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.NOT_STARTED,
    progress: 18,
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    cycleId: "demo_cycle_active",
    ownerId: "demo_user_jamie",
  },
  {
    id: "demo_obj_08",
    title: "Complete pricing experiment",
    description: "Validate packaging and price points with active prospects.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.COMPLETED,
    progress: 100,
    dueDate: new Date("2026-06-25T00:00:00.000Z"),
    cycleId: "demo_cycle_closed",
    ownerId: "demo_user_alex",
  },
  {
    id: "demo_obj_09",
    title: "Migrate lifecycle emails",
    description: "Move core lifecycle messages into the new automation stack.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.COMPLETED,
    progress: 100,
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    cycleId: "demo_cycle_closed",
    ownerId: "demo_user_priya",
  },
  {
    id: "demo_obj_10",
    title: "Retire legacy reporting flow",
    description: "Replace manual spreadsheet reporting with app rollups.",
    level: ObjectiveLevel.TEAM,
    status: ObjectiveStatus.OFF_TRACK,
    progress: 35,
    dueDate: new Date("2026-06-30T00:00:00.000Z"),
    cycleId: "demo_cycle_closed",
    ownerId: "demo_user_jamie",
  },
];

const keyResults = [
  ["demo_kr_01", "Reach 68% activation rate", KeyResultType.PERCENTAGE, 52, 68, 63, "%", CheckInConfidence.HIGH, "demo_obj_01", "demo_user_jamie"],
  ["demo_kr_02", "Reduce time to first objective to 12 minutes", KeyResultType.NUMBER, 28, 12, 16, "minutes", CheckInConfidence.MEDIUM, "demo_obj_01", "demo_user_priya"],
  ["demo_kr_03", "Create 40 qualified expansion opportunities", KeyResultType.NUMBER, 0, 40, 19, "opportunities", CheckInConfidence.LOW, "demo_obj_02", "demo_user_alex"],
  ["demo_kr_04", "Lift expansion meeting conversion to 35%", KeyResultType.PERCENTAGE, 21, 35, 27, "%", CheckInConfidence.MEDIUM, "demo_obj_02", "demo_user_alex"],
  ["demo_kr_05", "Review 80 customer accounts weekly", KeyResultType.NUMBER, 0, 80, 55, "accounts", CheckInConfidence.HIGH, "demo_obj_03", "demo_user_priya"],
  ["demo_kr_06", "Flag 95% of low-health accounts", KeyResultType.PERCENTAGE, 65, 95, 84, "%", CheckInConfidence.HIGH, "demo_obj_03", "demo_user_priya"],
  ["demo_kr_07", "Cut onboarding setup from 5 days to 2 days", KeyResultType.NUMBER, 5, 2, 3, "days", CheckInConfidence.MEDIUM, "demo_obj_04", "demo_user_jamie"],
  ["demo_kr_08", "Publish 6 guided setup templates", KeyResultType.NUMBER, 0, 6, 4, "templates", CheckInConfidence.HIGH, "demo_obj_04", "demo_user_jamie"],
  ["demo_kr_09", "Complete SOC2 readiness checklist", KeyResultType.BOOLEAN, 0, 1, 0, null, CheckInConfidence.LOW, "demo_obj_05", "demo_user_alex"],
  ["demo_kr_10", "Reduce P1 incident count below 2", KeyResultType.NUMBER, 5, 2, 4, "incidents", CheckInConfidence.LOW, "demo_obj_05", "demo_user_alex"],
  ["demo_kr_11", "Generate 300 product-qualified leads", KeyResultType.NUMBER, 0, 300, 246, "leads", CheckInConfidence.HIGH, "demo_obj_06", "demo_user_priya"],
  ["demo_kr_12", "Convert 18% of PQLs to sales conversations", KeyResultType.PERCENTAGE, 9, 18, 16, "%", CheckInConfidence.HIGH, "demo_obj_06", "demo_user_alex"],
  ["demo_kr_13", "Ship manager reporting widgets", KeyResultType.BOOLEAN, 0, 1, 0, null, CheckInConfidence.MEDIUM, "demo_obj_07", "demo_user_jamie"],
  ["demo_kr_14", "Increase weekly dashboard visits by 30%", KeyResultType.PERCENTAGE, 0, 30, 6, "%", CheckInConfidence.MEDIUM, "demo_obj_07", "demo_user_jamie"],
  ["demo_kr_15", "Complete 12 pricing interviews", KeyResultType.NUMBER, 0, 12, 12, "interviews", CheckInConfidence.HIGH, "demo_obj_08", "demo_user_alex"],
  ["demo_kr_16", "Launch new lifecycle sequence", KeyResultType.BOOLEAN, 0, 1, 1, null, CheckInConfidence.HIGH, "demo_obj_09", "demo_user_priya"],
  ["demo_kr_17", "Move weekly reports into app export", KeyResultType.BOOLEAN, 0, 1, 0, null, CheckInConfidence.LOW, "demo_obj_10", "demo_user_jamie"],
] as const;

const checkIns = [
  ["demo_checkin_01", "Activation is improving after the guided setup changes.", CheckInConfidence.HIGH, 72, 63, "demo_obj_01", "demo_kr_01", "demo_user_jamie", "2026-09-04T10:00:00.000Z"],
  ["demo_checkin_02", "Expansion pipeline volume is behind plan and needs tighter targeting.", CheckInConfidence.LOW, 48, 19, "demo_obj_02", "demo_kr_03", "demo_user_alex", "2026-09-04T10:20:00.000Z"],
  ["demo_checkin_03", "Customer health review is running weekly with good coverage.", CheckInConfidence.HIGH, 64, 55, "demo_obj_03", "demo_kr_05", "demo_user_priya", "2026-09-05T09:00:00.000Z"],
  ["demo_checkin_04", "Templates are helping but the setup handoff is still manual.", CheckInConfidence.MEDIUM, 58, 4, "demo_obj_04", "demo_kr_08", "demo_user_jamie", "2026-09-05T09:30:00.000Z"],
  ["demo_checkin_05", "Readiness work is slower than expected due to incident follow-up.", CheckInConfidence.LOW, 42, 0, "demo_obj_05", "demo_kr_09", "demo_user_alex", "2026-09-06T11:00:00.000Z"],
  ["demo_checkin_06", "PQL volume is ahead of plan and conversion is close to target.", CheckInConfidence.HIGH, 81, 246, "demo_obj_06", "demo_kr_11", "demo_user_priya", "2026-09-06T11:30:00.000Z"],
  ["demo_checkin_07", "Dashboard engagement work has started but needs design support.", CheckInConfidence.MEDIUM, 18, 6, "demo_obj_07", "demo_kr_14", "demo_user_jamie", "2026-09-07T13:00:00.000Z"],
  ["demo_checkin_08", "Pricing interviews completed and the new package recommendation is ready.", CheckInConfidence.HIGH, 100, 12, "demo_obj_08", "demo_kr_15", "demo_user_alex", "2026-06-24T15:00:00.000Z"],
  ["demo_checkin_09", "Lifecycle sequence launched and early engagement is above baseline.", CheckInConfidence.HIGH, 100, 1, "demo_obj_09", "demo_kr_16", "demo_user_priya", "2026-06-18T14:00:00.000Z"],
  ["demo_checkin_10", "Legacy report retirement missed the target and remains open.", CheckInConfidence.LOW, 35, 0, "demo_obj_10", "demo_kr_17", "demo_user_jamie", "2026-06-27T16:00:00.000Z"],
] as const;

async function main() {
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      create: user,
    });
  }

  await prisma.organization.upsert({
    where: { slug: organization.slug },
    update: {
      id: organization.id,
      name: organization.name,
      ownerId: organization.ownerId,
    },
    create: organization,
  });

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      members: {
        connect: users.map((user) => ({ email: user.email })),
      },
    },
  });

  await prisma.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: workspace.organizationId,
        slug: workspace.slug,
      },
    },
    update: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      leadId: workspace.leadId,
    },
    create: workspace,
  });

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      members: {
        connect: users.map((user) => ({ email: user.email })),
      },
    },
  });

  for (const cycle of cycles) {
    await prisma.cycle.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: cycle.slug,
        },
      },
      update: {
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        startsAt: cycle.startsAt,
        endsAt: cycle.endsAt,
        workspaceId: workspace.id,
      },
      create: {
        ...cycle,
        organizationId: organization.id,
        workspaceId: workspace.id,
      },
    });
  }

  for (const objective of objectives) {
    await prisma.objective.upsert({
      where: { id: objective.id },
      update: {
        title: objective.title,
        description: objective.description,
        level: objective.level,
        status: objective.status,
        progress: objective.progress,
        dueDate: objective.dueDate,
        cycleId: objective.cycleId,
        ownerId: objective.ownerId,
        workspaceId: workspace.id,
      },
      create: {
        ...objective,
        organizationId: organization.id,
        workspaceId: workspace.id,
        creatorId: organization.ownerId,
      },
    });
  }

  for (const [
    id,
    title,
    type,
    startValue,
    targetValue,
    currentValue,
    unit,
    confidence,
    objectiveId,
    ownerId,
  ] of keyResults) {
    await prisma.keyResult.upsert({
      where: { id },
      update: {
        title,
        type,
        startValue,
        targetValue,
        currentValue,
        unit,
        confidence,
        objectiveId,
        ownerId,
        workspaceId: workspace.id,
      },
      create: {
        id,
        title,
        type,
        startValue,
        targetValue,
        currentValue,
        unit,
        confidence,
        organizationId: organization.id,
        workspaceId: workspace.id,
        objectiveId,
        ownerId,
      },
    });
  }

  for (const [
    id,
    note,
    confidence,
    progress,
    value,
    objectiveId,
    keyResultId,
    authorId,
    createdAt,
  ] of checkIns) {
    await prisma.checkIn.upsert({
      where: { id },
      update: {
        note,
        confidence,
        progress,
        value,
        objectiveId,
        keyResultId,
        authorId,
        workspaceId: workspace.id,
      },
      create: {
        id,
        note,
        confidence,
        progress,
        value,
        organizationId: organization.id,
        workspaceId: workspace.id,
        objectiveId,
        keyResultId,
        authorId,
        createdAt: new Date(createdAt),
      },
    });
  }
}

main()
  .then(async () => {
    console.log("Demo seed data is ready.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
