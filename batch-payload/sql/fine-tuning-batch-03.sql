-- eDekhbhal Fine-tuning Batch 03
-- Run in Supabase STAGING before deploying the application patch.
DO $$
BEGIN
  CREATE TYPE "ReportedWorkStatus" AS ENUM ('NEW', 'DISMISSED', 'SCHEDULE_CREATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'REPORTED_WORK_ITEM_CREATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'REPORTED_WORK_ITEM_DISMISSED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'REPORTED_WORK_ITEM_SCHEDULE_LINKED';

CREATE TABLE IF NOT EXISTS "ReportedWorkItem" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "workAreaId" TEXT NOT NULL,
  "sourceNoteId" TEXT NOT NULL UNIQUE,
  "noteScope" "OccurrenceNoteScope" NOT NULL,
  "noteText" TEXT NOT NULL,
  "sourceTaskName" VARCHAR(500),
  "sourceScheduleName" VARCHAR(500),
  "reportedById" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ReportedWorkStatus" NOT NULL DEFAULT 'NEW',
  "dismissedAt" TIMESTAMP(3),
  "dismissedById" TEXT,
  "linkedScheduleId" TEXT,
  "scheduleLinkedAt" TIMESTAMP(3),
  "scheduleLinkedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ReportedWorkItem_organizationId_status_reportedAt_idx" ON "ReportedWorkItem" ("organizationId","status","reportedAt");
CREATE INDEX IF NOT EXISTS "ReportedWorkItem_propertyId_status_reportedAt_idx" ON "ReportedWorkItem" ("propertyId","status","reportedAt");
CREATE INDEX IF NOT EXISTS "ReportedWorkItem_workAreaId_reportedAt_idx" ON "ReportedWorkItem" ("workAreaId","reportedAt");
CREATE INDEX IF NOT EXISTS "ReportedWorkItem_reportedById_reportedAt_idx" ON "ReportedWorkItem" ("reportedById","reportedAt");
CREATE INDEX IF NOT EXISTS "ReportedWorkItem_linkedScheduleId_idx" ON "ReportedWorkItem" ("linkedScheduleId");

DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "ScheduleOccurrenceNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_linkedScheduleId_fkey" FOREIGN KEY ("linkedScheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE "ReportedWorkItem" ADD CONSTRAINT "ReportedWorkItem_scheduleLinkedById_fkey" FOREIGN KEY ("scheduleLinkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
