-- eDekhbhal v0.5.1 — recurring end date, working-hours hierarchy, and ScheduleOccurrence foundation.
-- Run after supabase-v0.5.0.sql and before deploying/testing v0.5.1.

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_OCCURRENCES_GENERATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_OCCURRENCES_RECONCILED';

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "workingHours" JSONB;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "workingHours" JSONB;
ALTER TABLE "WorkArea" ADD COLUMN IF NOT EXISTS "workingHours" JSONB;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "endDate" DATE;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "occurrenceGeneratedThrough" TIMESTAMPTZ;

DO $$ BEGIN
  CREATE TYPE "EvidenceCaptureType" AS ENUM ('PHOTO','VIDEO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScheduleOccurrenceStatus" AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','PARTIALLY_COMPLETED','MISSED','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ScheduleOccurrenceTaskStatus" AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','SKIPPED','FAILED','MISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ScheduleOccurrence" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "workAreaId" TEXT NOT NULL,
  "scheduledStartAt" TIMESTAMPTZ NOT NULL,
  "scheduledEndAt" TIMESTAMPTZ NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "scheduleNameSnapshot" VARCHAR(500) NOT NULL,
  "workAreaNameSnapshot" VARCHAR(500) NOT NULL,
  "propertyNameSnapshot" VARCHAR(500) NOT NULL,
  "plannedDurationMinutes" INTEGER NOT NULL,
  "status" "ScheduleOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
  "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleOccurrence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleOccurrence_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleOccurrence_scheduleId_scheduledStartAt_key" UNIQUE ("scheduleId","scheduledStartAt"),
  CONSTRAINT "ScheduleOccurrence_duration_positive" CHECK ("plannedDurationMinutes" > 0)
);

CREATE TABLE IF NOT EXISTS "ScheduleOccurrenceTask" (
  "id" TEXT PRIMARY KEY,
  "occurrenceId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "taskNameSnapshot" VARCHAR(500) NOT NULL,
  "taskDescriptionSnapshot" TEXT NOT NULL,
  "plannedDurationMinutes" INTEGER NOT NULL,
  "plannedStartAt" TIMESTAMPTZ NOT NULL,
  "plannedEndAt" TIMESTAMPTZ NOT NULL,
  "evidenceRuleSnapshot" "EvidenceRule" NOT NULL,
  "evidenceRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "evidenceTypeRequired" "RandomEvidenceType",
  "status" "ScheduleOccurrenceTaskStatus" NOT NULL DEFAULT 'PENDING',
  "actualStartAt" TIMESTAMPTZ,
  "actualEndAt" TIMESTAMPTZ,
  "actualDurationMinutes" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleOccurrenceTask_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ScheduleOccurrence"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleOccurrenceTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleOccurrenceTask_occurrenceId_sequence_key" UNIQUE ("occurrenceId","sequence"),
  CONSTRAINT "ScheduleOccurrenceTask_duration_positive" CHECK ("plannedDurationMinutes" > 0)
);

CREATE TABLE IF NOT EXISTS "ScheduleOccurrenceEvidence" (
  "id" TEXT PRIMARY KEY,
  "occurrenceTaskId" TEXT NOT NULL,
  "type" "EvidenceCaptureType" NOT NULL,
  "storagePath" TEXT NOT NULL,
  "thumbnailPath" TEXT,
  "mimeType" VARCHAR(150) NOT NULL,
  "sizeBytes" INTEGER,
  "capturedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "capturedById" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleOccurrenceEvidence_occurrenceTaskId_fkey" FOREIGN KEY ("occurrenceTaskId") REFERENCES "ScheduleOccurrenceTask"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleOccurrenceEvidence_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_organization_start_status_idx" ON "ScheduleOccurrence"("organizationId","scheduledStartAt","status");
CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_workarea_start_status_idx" ON "ScheduleOccurrence"("workAreaId","scheduledStartAt","status");
CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceTask_task_idx" ON "ScheduleOccurrenceTask"("taskId");
CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceTask_occurrence_status_idx" ON "ScheduleOccurrenceTask"("occurrenceId","status");
CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceEvidence_task_captured_idx" ON "ScheduleOccurrenceEvidence"("occurrenceTaskId","capturedAt");

DROP TRIGGER IF EXISTS "ScheduleOccurrence_set_updatedAt" ON "ScheduleOccurrence";
CREATE TRIGGER "ScheduleOccurrence_set_updatedAt" BEFORE UPDATE ON "ScheduleOccurrence" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS "ScheduleOccurrenceTask_set_updatedAt" ON "ScheduleOccurrenceTask";
CREATE TRIGGER "ScheduleOccurrenceTask_set_updatedAt" BEFORE UPDATE ON "ScheduleOccurrenceTask" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
