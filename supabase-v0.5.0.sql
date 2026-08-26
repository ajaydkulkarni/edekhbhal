-- eDekhbhal v0.5.0 — Schedules module
-- Run in Supabase SQL Editor before testing v0.5.0.

DO $$ BEGIN
  CREATE TYPE "ScheduleFrequencyType" AS ENUM ('ONE_TIME', 'RECURRING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScheduleRecurrenceUnit" AS ENUM ('MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvidenceRule" AS ENUM ('NONE', 'PHOTO', 'VIDEO', 'RANDOM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RandomEvidenceType" AS ENUM ('PHOTO', 'VIDEO', 'EITHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_CREATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_UPDATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_INACTIVATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_REACTIVATED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_DUPLICATED';

CREATE TABLE IF NOT EXISTS "Schedule" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" VARCHAR(500) NOT NULL,
  "frequencyType" "ScheduleFrequencyType" NOT NULL,
  "recurrenceUnit" "ScheduleRecurrenceUnit",
  "recurrenceInterval" INTEGER,
  "recurrenceConfig" JSONB,
  "startAt" TIMESTAMPTZ NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "workAreaId" TEXT NOT NULL,
  "status" "Status" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Schedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Schedule_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE RESTRICT,
  CONSTRAINT "Schedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "ScheduleTask" (
  "id" TEXT PRIMARY KEY,
  "scheduleId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "plannedStartOffsetMinutes" INTEGER NOT NULL,
  "plannedEndOffsetMinutes" INTEGER NOT NULL,
  "evidenceRule" "EvidenceRule" NOT NULL DEFAULT 'NONE',
  "randomEveryN" INTEGER,
  "randomEvidenceType" "RandomEvidenceType",
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleTask_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleTask_scheduleId_sequence_key" UNIQUE ("scheduleId", "sequence"),
  CONSTRAINT "ScheduleTask_duration_positive" CHECK ("durationMinutes" > 0),
  CONSTRAINT "ScheduleTask_offsets_valid" CHECK ("plannedStartOffsetMinutes" >= 0 AND "plannedEndOffsetMinutes" > "plannedStartOffsetMinutes"),
  CONSTRAINT "ScheduleTask_random_n_valid" CHECK ("randomEveryN" IS NULL OR "randomEveryN" >= 2)
);

CREATE INDEX IF NOT EXISTS "Schedule_organizationId_status_idx" ON "Schedule"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Schedule_workAreaId_status_idx" ON "Schedule"("workAreaId", "status");
CREATE INDEX IF NOT EXISTS "Schedule_organizationId_startAt_idx" ON "Schedule"("organizationId", "startAt");
CREATE INDEX IF NOT EXISTS "ScheduleTask_taskId_idx" ON "ScheduleTask"("taskId");

DROP TRIGGER IF EXISTS "Schedule_set_updatedAt" ON "Schedule";
CREATE TRIGGER "Schedule_set_updatedAt"
BEFORE UPDATE ON "Schedule"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS "ScheduleTask_set_updatedAt" ON "ScheduleTask";
CREATE TRIGGER "ScheduleTask_set_updatedAt"
BEFORE UPDATE ON "ScheduleTask"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
