DO $$
BEGIN
  INSERT INTO "User" ("id", "email", "name", "role", "createdAt", "updatedAt")
  VALUES
    ('demo_user_alex', 'alex@demo.local', 'Alex Morgan', 'ADMIN', now(), now()),
    ('demo_user_jamie', 'jamie@demo.local', 'Jamie Chen', 'MEMBER', now(), now()),
    ('demo_user_priya', 'priya@demo.local', 'Priya Shah', 'MEMBER', now(), now())
  ON CONFLICT ("id") DO UPDATE SET
    "email" = EXCLUDED."email",
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "updatedAt" = now();

  INSERT INTO "Organization" ("id", "name", "slug", "ownerId", "createdAt", "updatedAt")
  VALUES ('demo_org_acme', 'Acme Demo', 'acme-demo', 'demo_user_alex', now(), now())
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "slug" = EXCLUDED."slug",
    "ownerId" = EXCLUDED."ownerId",
    "updatedAt" = now();

  INSERT INTO "Workspace" ("id", "name", "slug", "description", "organizationId", "leadId", "createdAt", "updatedAt")
  VALUES (
    'demo_workspace_growth',
    'Growth Team',
    'growth-team',
    'Demo workspace for OKR planning and weekly check-ins.',
    'demo_org_acme',
    'demo_user_jamie',
    now(),
    now()
  )
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "slug" = EXCLUDED."slug",
    "description" = EXCLUDED."description",
    "organizationId" = EXCLUDED."organizationId",
    "leadId" = EXCLUDED."leadId",
    "updatedAt" = now();

  INSERT INTO "_OrganizationMembers" ("A", "B")
  VALUES
    ('demo_org_acme', 'demo_user_alex'),
    ('demo_org_acme', 'demo_user_jamie'),
    ('demo_org_acme', 'demo_user_priya')
  ON CONFLICT ("A", "B") DO NOTHING;

  INSERT INTO "_WorkspaceMembers" ("A", "B")
  VALUES
    ('demo_user_alex', 'demo_workspace_growth'),
    ('demo_user_jamie', 'demo_workspace_growth'),
    ('demo_user_priya', 'demo_workspace_growth')
  ON CONFLICT ("A", "B") DO NOTHING;

  INSERT INTO "Cycle" ("id", "name", "slug", "status", "startsAt", "endsAt", "organizationId", "workspaceId", "createdAt", "updatedAt")
  VALUES
    (
      'demo_cycle_active',
      'Q3 2026',
      'q3-2026',
      'ACTIVE',
      '2026-07-01 00:00:00',
      '2026-09-30 23:59:59',
      'demo_org_acme',
      'demo_workspace_growth',
      now(),
      now()
    ),
    (
      'demo_cycle_closed',
      'Q2 2026',
      'q2-2026',
      'CLOSED',
      '2026-04-01 00:00:00',
      '2026-06-30 23:59:59',
      'demo_org_acme',
      'demo_workspace_growth',
      now(),
      now()
    )
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "slug" = EXCLUDED."slug",
    "status" = EXCLUDED."status",
    "startsAt" = EXCLUDED."startsAt",
    "endsAt" = EXCLUDED."endsAt",
    "organizationId" = EXCLUDED."organizationId",
    "workspaceId" = EXCLUDED."workspaceId",
    "updatedAt" = now();

  INSERT INTO "Objective" ("id", "title", "description", "level", "status", "progress", "dueDate", "organizationId", "workspaceId", "cycleId", "ownerId", "creatorId", "createdAt", "updatedAt")
  VALUES
    ('demo_obj_01', 'Increase self-serve activation', 'Help new accounts reach first value faster.', 'TEAM', 'ON_TRACK', 72, '2026-09-30 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_jamie', 'demo_user_alex', now(), now()),
    ('demo_obj_02', 'Improve expansion pipeline quality', 'Focus the revenue team on qualified expansion opportunities.', 'TEAM', 'AT_RISK', 48, '2026-09-30 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_alex', 'demo_user_alex', now(), now()),
    ('demo_obj_03', 'Launch weekly customer health review', 'Build a reliable operating rhythm for customer health.', 'TEAM', 'ON_TRACK', 64, '2026-09-20 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_priya', 'demo_user_alex', now(), now()),
    ('demo_obj_04', 'Reduce onboarding time', 'Shorten the path from signup to configured workspace.', 'TEAM', 'ON_TRACK', 58, '2026-09-25 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_jamie', 'demo_user_alex', now(), now()),
    ('demo_obj_05', 'Strengthen enterprise readiness', 'Close reliability and security gaps for larger customers.', 'COMPANY', 'AT_RISK', 42, '2026-09-30 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_alex', 'demo_user_alex', now(), now()),
    ('demo_obj_06', 'Grow product-qualified leads', 'Increase qualified intent from product usage.', 'TEAM', 'ON_TRACK', 81, '2026-09-30 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_priya', 'demo_user_alex', now(), now()),
    ('demo_obj_07', 'Improve dashboard engagement', 'Make weekly OKR review easier for managers.', 'TEAM', 'NOT_STARTED', 18, '2026-09-30 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_active', 'demo_user_jamie', 'demo_user_alex', now(), now()),
    ('demo_obj_08', 'Complete pricing experiment', 'Validate packaging and price points with active prospects.', 'TEAM', 'COMPLETED', 100, '2026-06-25 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_closed', 'demo_user_alex', 'demo_user_alex', now(), now()),
    ('demo_obj_09', 'Migrate lifecycle emails', 'Move core lifecycle messages into the new automation stack.', 'TEAM', 'COMPLETED', 100, '2026-06-20 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_closed', 'demo_user_priya', 'demo_user_alex', now(), now()),
    ('demo_obj_10', 'Retire legacy reporting flow', 'Replace manual spreadsheet reporting with app rollups.', 'TEAM', 'OFF_TRACK', 35, '2026-06-30 00:00:00', 'demo_org_acme', 'demo_workspace_growth', 'demo_cycle_closed', 'demo_user_jamie', 'demo_user_alex', now(), now())
  ON CONFLICT ("id") DO UPDATE SET
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "level" = EXCLUDED."level",
    "status" = EXCLUDED."status",
    "progress" = EXCLUDED."progress",
    "dueDate" = EXCLUDED."dueDate",
    "organizationId" = EXCLUDED."organizationId",
    "workspaceId" = EXCLUDED."workspaceId",
    "cycleId" = EXCLUDED."cycleId",
    "ownerId" = EXCLUDED."ownerId",
    "creatorId" = EXCLUDED."creatorId",
    "updatedAt" = now();

  INSERT INTO "KeyResult" ("id", "title", "description", "type", "startValue", "targetValue", "currentValue", "unit", "confidence", "organizationId", "workspaceId", "objectiveId", "ownerId", "createdAt", "updatedAt")
  VALUES
    ('demo_kr_01', 'Reach 68% activation rate', NULL, 'PERCENTAGE', 52, 68, 63, '%', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_01', 'demo_user_jamie', now(), now()),
    ('demo_kr_02', 'Reduce time to first objective to 12 minutes', NULL, 'NUMBER', 28, 12, 16, 'minutes', 'MEDIUM', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_01', 'demo_user_priya', now(), now()),
    ('demo_kr_03', 'Create 40 qualified expansion opportunities', NULL, 'NUMBER', 0, 40, 19, 'opportunities', 'LOW', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_02', 'demo_user_alex', now(), now()),
    ('demo_kr_04', 'Lift expansion meeting conversion to 35%', NULL, 'PERCENTAGE', 21, 35, 27, '%', 'MEDIUM', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_02', 'demo_user_alex', now(), now()),
    ('demo_kr_05', 'Review 80 customer accounts weekly', NULL, 'NUMBER', 0, 80, 55, 'accounts', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_03', 'demo_user_priya', now(), now()),
    ('demo_kr_06', 'Flag 95% of low-health accounts', NULL, 'PERCENTAGE', 65, 95, 84, '%', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_03', 'demo_user_priya', now(), now()),
    ('demo_kr_07', 'Cut onboarding setup from 5 days to 2 days', NULL, 'NUMBER', 5, 2, 3, 'days', 'MEDIUM', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_04', 'demo_user_jamie', now(), now()),
    ('demo_kr_08', 'Publish 6 guided setup templates', NULL, 'NUMBER', 0, 6, 4, 'templates', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_04', 'demo_user_jamie', now(), now()),
    ('demo_kr_09', 'Complete SOC2 readiness checklist', NULL, 'BOOLEAN', 0, 1, 0, NULL, 'LOW', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_05', 'demo_user_alex', now(), now()),
    ('demo_kr_10', 'Reduce P1 incident count below 2', NULL, 'NUMBER', 5, 2, 4, 'incidents', 'LOW', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_05', 'demo_user_alex', now(), now()),
    ('demo_kr_11', 'Generate 300 product-qualified leads', NULL, 'NUMBER', 0, 300, 246, 'leads', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_06', 'demo_user_priya', now(), now()),
    ('demo_kr_12', 'Convert 18% of PQLs to sales conversations', NULL, 'PERCENTAGE', 9, 18, 16, '%', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_06', 'demo_user_alex', now(), now()),
    ('demo_kr_13', 'Ship manager reporting widgets', NULL, 'BOOLEAN', 0, 1, 0, NULL, 'MEDIUM', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_07', 'demo_user_jamie', now(), now()),
    ('demo_kr_14', 'Increase weekly dashboard visits by 30%', NULL, 'PERCENTAGE', 0, 30, 6, '%', 'MEDIUM', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_07', 'demo_user_jamie', now(), now()),
    ('demo_kr_15', 'Complete 12 pricing interviews', NULL, 'NUMBER', 0, 12, 12, 'interviews', 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_08', 'demo_user_alex', now(), now()),
    ('demo_kr_16', 'Launch new lifecycle sequence', NULL, 'BOOLEAN', 0, 1, 1, NULL, 'HIGH', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_09', 'demo_user_priya', now(), now()),
    ('demo_kr_17', 'Move weekly reports into app export', NULL, 'BOOLEAN', 0, 1, 0, NULL, 'LOW', 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_10', 'demo_user_jamie', now(), now())
  ON CONFLICT ("id") DO UPDATE SET
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "type" = EXCLUDED."type",
    "startValue" = EXCLUDED."startValue",
    "targetValue" = EXCLUDED."targetValue",
    "currentValue" = EXCLUDED."currentValue",
    "unit" = EXCLUDED."unit",
    "confidence" = EXCLUDED."confidence",
    "organizationId" = EXCLUDED."organizationId",
    "workspaceId" = EXCLUDED."workspaceId",
    "objectiveId" = EXCLUDED."objectiveId",
    "ownerId" = EXCLUDED."ownerId",
    "updatedAt" = now();

  INSERT INTO "CheckIn" ("id", "note", "confidence", "progress", "value", "organizationId", "workspaceId", "objectiveId", "keyResultId", "authorId", "createdAt", "updatedAt")
  VALUES
    ('demo_checkin_01', 'Activation is improving after the guided setup changes.', 'HIGH', 72, 63, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_01', 'demo_kr_01', 'demo_user_jamie', '2026-09-04 10:00:00', now()),
    ('demo_checkin_02', 'Expansion pipeline volume is behind plan and needs tighter targeting.', 'LOW', 48, 19, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_02', 'demo_kr_03', 'demo_user_alex', '2026-09-04 10:20:00', now()),
    ('demo_checkin_03', 'Customer health review is running weekly with good coverage.', 'HIGH', 64, 55, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_03', 'demo_kr_05', 'demo_user_priya', '2026-09-05 09:00:00', now()),
    ('demo_checkin_04', 'Templates are helping but the setup handoff is still manual.', 'MEDIUM', 58, 4, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_04', 'demo_kr_08', 'demo_user_jamie', '2026-09-05 09:30:00', now()),
    ('demo_checkin_05', 'Readiness work is slower than expected due to incident follow-up.', 'LOW', 42, 0, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_05', 'demo_kr_09', 'demo_user_alex', '2026-09-06 11:00:00', now()),
    ('demo_checkin_06', 'PQL volume is ahead of plan and conversion is close to target.', 'HIGH', 81, 246, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_06', 'demo_kr_11', 'demo_user_priya', '2026-09-06 11:30:00', now()),
    ('demo_checkin_07', 'Dashboard engagement work has started but needs design support.', 'MEDIUM', 18, 6, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_07', 'demo_kr_14', 'demo_user_jamie', '2026-09-07 13:00:00', now()),
    ('demo_checkin_08', 'Pricing interviews completed and the new package recommendation is ready.', 'HIGH', 100, 12, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_08', 'demo_kr_15', 'demo_user_alex', '2026-06-24 15:00:00', now()),
    ('demo_checkin_09', 'Lifecycle sequence launched and early engagement is above baseline.', 'HIGH', 100, 1, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_09', 'demo_kr_16', 'demo_user_priya', '2026-06-18 14:00:00', now()),
    ('demo_checkin_10', 'Legacy report retirement missed the target and remains open.', 'LOW', 35, 0, 'demo_org_acme', 'demo_workspace_growth', 'demo_obj_10', 'demo_kr_17', 'demo_user_jamie', '2026-06-27 16:00:00', now())
  ON CONFLICT ("id") DO UPDATE SET
    "note" = EXCLUDED."note",
    "confidence" = EXCLUDED."confidence",
    "progress" = EXCLUDED."progress",
    "value" = EXCLUDED."value",
    "organizationId" = EXCLUDED."organizationId",
    "workspaceId" = EXCLUDED."workspaceId",
    "objectiveId" = EXCLUDED."objectiveId",
    "keyResultId" = EXCLUDED."keyResultId",
    "authorId" = EXCLUDED."authorId",
    "createdAt" = EXCLUDED."createdAt",
    "updatedAt" = now();
END $$;
