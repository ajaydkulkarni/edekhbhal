ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isAdHoc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScheduleOccurrenceTask" ADD COLUMN IF NOT EXISTS "completedById" TEXT;
DO $$ BEGIN ALTER TABLE "ScheduleOccurrenceTask" ADD CONSTRAINT "ScheduleOccurrenceTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "ScheduleOccurrenceTask_completedById_idx" ON "ScheduleOccurrenceTask"("completedById");
DO $$ BEGIN CREATE TYPE "EntitlementType" AS ENUM ('FEATURE','LIMIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "OrganizationEntitlement" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"code" VARCHAR(120) NOT NULL,"type" "EntitlementType" NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT true,"limitValue" INTEGER,"startsAt" TIMESTAMP(3),"endsAt" TIMESTAMP(3),"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "OrganizationEntitlement_pkey" PRIMARY KEY ("id"));
DO $$ BEGIN ALTER TABLE "OrganizationEntitlement" ADD CONSTRAINT "OrganizationEntitlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationEntitlement_organizationId_code_key" ON "OrganizationEntitlement"("organizationId","code");
CREATE INDEX IF NOT EXISTS "OrganizationEntitlement_organizationId_type_idx" ON "OrganizationEntitlement"("organizationId","type");
