-- CreateTable
CREATE TABLE "GitHubIntegration" (
    "id" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "branch" TEXT,
    "incrementBy" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "keyResultId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "lastDeliveryId" TEXT,
    "lastMergedPullRequestUrl" TEXT,
    "lastMergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubIntegration_keyResultId_key" ON "GitHubIntegration"("keyResultId");

-- CreateIndex
CREATE INDEX "GitHubIntegration_organizationId_idx" ON "GitHubIntegration"("organizationId");

-- CreateIndex
CREATE INDEX "GitHubIntegration_workspaceId_idx" ON "GitHubIntegration"("workspaceId");

-- CreateIndex
CREATE INDEX "GitHubIntegration_repository_idx" ON "GitHubIntegration"("repository");

-- CreateIndex
CREATE INDEX "GitHubIntegration_branch_idx" ON "GitHubIntegration"("branch");

-- AddForeignKey
ALTER TABLE "GitHubIntegration" ADD CONSTRAINT "GitHubIntegration_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubIntegration" ADD CONSTRAINT "GitHubIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubIntegration" ADD CONSTRAINT "GitHubIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
