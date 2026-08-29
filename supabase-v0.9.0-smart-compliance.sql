-- eDekhbhal v0.9.0 — Smart Service Compliance & Public Work Area QR
-- Apply once in the staging Supabase SQL Editor after automated compile checks.

BEGIN;

ALTER TYPE "ActionType"
  ADD VALUE IF NOT EXISTS 'SCHEDULE_OCCURRENCE_AUTO_MISSED';

ALTER TABLE "Schedule"
  ADD COLUMN IF NOT EXISTS "supersedeUnstarted" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "ScheduleOccurrence"
  ADD COLUMN IF NOT EXISTS "autoMissedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "missedReason" TEXT;

CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_scheduleId_scheduledStartAt_status_idx"
  ON "ScheduleOccurrence" ("scheduleId", "scheduledStartAt", "status");

COMMIT;
