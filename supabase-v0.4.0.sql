-- eDekhbhal v0.4.0 - Tasks module upgrade
-- Run this after the v0.3.0 upgrade and before testing v0.4.0.

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_CREATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_UPDATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_INACTIVATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_REACTIVATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_ATTACHMENT_ADDED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_ATTACHMENT_REMOVED';

CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" VARCHAR(500) NOT NULL,
  "descriptionHtml" TEXT NOT NULL,
  "status" "Status" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "Task_organizationId_status_idx" ON "Task"("organizationId","status");
CREATE INDEX IF NOT EXISTS "Task_organizationId_name_idx" ON "Task"("organizationId","name");

CREATE TABLE IF NOT EXISTS "TaskAttachment" (
  "id" TEXT PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(150) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "contentBase64" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE,
  CONSTRAINT "TaskAttachment_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_createdAt_idx" ON "TaskAttachment"("taskId","createdAt");

DROP TRIGGER IF EXISTS "Task_set_updatedAt" ON "Task";
CREATE TRIGGER "Task_set_updatedAt"
BEFORE UPDATE ON "Task"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
