-- eDekhbhal v0.6.0 — Mobile Execution foundation
-- Run in Supabase SQL Editor before deploying/testing v0.6.0.

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_CLAIMED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_CLAIM_RELEASED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_CLAIM_EXPIRED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_EXECUTION_STARTED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_EXECUTION_STARTED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_EXECUTION_COMPLETED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_EXECUTION_COMPLETED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'TASK_NOTE_ADDED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'SCHEDULE_NOTE_ADDED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'EVIDENCE_CAPTURED';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'MOBILE_SESSION_CREATED';

DO $$ BEGIN
  CREATE TYPE "OccurrenceNoteScope" AS ENUM ('SCHEDULE', 'TASK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "claimExpiryMinutes" INTEGER NOT NULL DEFAULT 15;

DO $$ BEGIN
  ALTER TABLE "Organization"
    ADD CONSTRAINT "Organization_claimExpiryMinutes_valid"
    CHECK ("claimExpiryMinutes" BETWEEN 1 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ScheduleOccurrence"
ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT,
ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "claimExpiresAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "actualDurationSeconds" INTEGER;

DO $$ BEGIN
  ALTER TABLE "ScheduleOccurrence"
    ADD CONSTRAINT "ScheduleOccurrence_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ScheduleOccurrenceTask"
ADD COLUMN IF NOT EXISTS "actualDurationSeconds" INTEGER;

CREATE TABLE IF NOT EXISTS "ScheduleOccurrenceNote" (
  "id" TEXT PRIMARY KEY,
  "occurrenceId" TEXT NOT NULL,
  "occurrenceTaskId" TEXT,
  "scope" "OccurrenceNoteScope" NOT NULL,
  "note" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleOccurrenceNote_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "ScheduleOccurrence"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleOccurrenceNote_occurrenceTaskId_fkey"
    FOREIGN KEY ("occurrenceTaskId") REFERENCES "ScheduleOccurrenceTask"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleOccurrenceNote_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ScheduleOccurrenceNote_scope_task_consistency"
    CHECK (
      ("scope" = 'SCHEDULE' AND "occurrenceTaskId" IS NULL)
      OR
      ("scope" = 'TASK' AND "occurrenceTaskId" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_organizationId_assignedUserId_status_idx"
  ON "ScheduleOccurrence"("organizationId", "assignedUserId", "status");

CREATE INDEX IF NOT EXISTS "ScheduleOccurrence_organizationId_claimExpiresAt_status_idx"
  ON "ScheduleOccurrence"("organizationId", "claimExpiresAt", "status");

-- A worker may have only one claimed or in-progress occurrence at a time.
-- This closes the race where two simultaneous claim requests from the same USER
-- both pass the application-level pre-check. Completed history keeps assignedUserId.
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleOccurrence_one_active_assignment_per_user"
  ON "ScheduleOccurrence"("assignedUserId")
  WHERE "assignedUserId" IS NOT NULL
    AND "status" IN ('PENDING', 'IN_PROGRESS');

CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceNote_occurrenceId_createdAt_idx"
  ON "ScheduleOccurrenceNote"("occurrenceId", "createdAt");

CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceNote_occurrenceTaskId_createdAt_idx"
  ON "ScheduleOccurrenceNote"("occurrenceTaskId", "createdAt");

CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceNote_createdById_createdAt_idx"
  ON "ScheduleOccurrenceNote"("createdById", "createdAt");

CREATE OR REPLACE FUNCTION prevent_schedule_occurrence_note_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ScheduleOccurrenceNote is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ScheduleOccurrenceNote_prevent_update" ON "ScheduleOccurrenceNote";
CREATE TRIGGER "ScheduleOccurrenceNote_prevent_update"
BEFORE UPDATE ON "ScheduleOccurrenceNote"
FOR EACH ROW EXECUTE FUNCTION prevent_schedule_occurrence_note_mutation();

DROP TRIGGER IF EXISTS "ScheduleOccurrenceNote_prevent_delete" ON "ScheduleOccurrenceNote";
CREATE TRIGGER "ScheduleOccurrenceNote_prevent_delete"
BEFORE DELETE ON "ScheduleOccurrenceNote"
FOR EACH ROW EXECUTE FUNCTION prevent_schedule_occurrence_note_mutation();

-- Private Supabase Storage bucket for camera-captured execution evidence.
-- The server creates short-lived signed upload/download URLs using the service-role key.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'execution-evidence',
  'execution-evidence',
  false,
  52428800,
  ARRAY['image/jpeg','image/png','video/mp4','video/quicktime']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
