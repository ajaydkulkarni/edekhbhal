-- eDekhbhal v0.8.0 — Mobile UX, Profile, Password Authentication & Translation Cache
-- Additive staging migration. Existing task/schedule/occurrence data is not altered.

BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "preferredLanguage" VARCHAR(10);

ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "authMethod" VARCHAR(30);

CREATE TABLE IF NOT EXISTS "ContentTranslation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceType" VARCHAR(40) NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fieldName" VARCHAR(40) NOT NULL,
  "language" VARCHAR(10) NOT NULL,
  "sourceHash" VARCHAR(64) NOT NULL,
  "translatedText" TEXT NOT NULL,
  "provider" VARCHAR(40),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContentTranslation_organizationId_fkey'
  ) THEN
    ALTER TABLE "ContentTranslation"
      ADD CONSTRAINT "ContentTranslation_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ContentTranslation_org_source_field_language_key"
  ON "ContentTranslation"("organizationId", "sourceType", "sourceId", "fieldName", "language");

CREATE INDEX IF NOT EXISTS "ContentTranslation_organizationId_language_idx"
  ON "ContentTranslation"("organizationId", "language");

COMMIT;
