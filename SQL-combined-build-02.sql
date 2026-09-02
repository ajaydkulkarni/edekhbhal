-- eDekhbhal Combined Build 02
-- Controlled-document fields for Schedule + immutable occurrence snapshots.
-- Additive migration only. Existing rows remain NULL.

ALTER TABLE "Schedule"
  ADD COLUMN IF NOT EXISTS "documentReference" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "documentRevision" VARCHAR(100);

ALTER TABLE "ScheduleOccurrence"
  ADD COLUMN IF NOT EXISTS "documentReferenceSnapshot" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "documentRevisionSnapshot" VARCHAR(100);
