BEGIN;

ALTER TABLE "OrganizationMember"
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine3" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "mobilePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "residencePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "photoStoragePath" TEXT;

CREATE TABLE IF NOT EXISTS "OrganizationMemberProperty" (
  "id" TEXT PRIMARY KEY,
  "organizationMemberId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMemberProperty_organizationMemberId_fkey"
    FOREIGN KEY ("organizationMemberId") REFERENCES "OrganizationMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationMemberProperty_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationMemberProperty_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "OrganizationMemberProperty_organizationMemberId_propertyId_key"
  ON "OrganizationMemberProperty" ("organizationMemberId", "propertyId");
CREATE INDEX IF NOT EXISTS "OrganizationMemberProperty_propertyId_idx"
  ON "OrganizationMemberProperty" ("propertyId");
CREATE INDEX IF NOT EXISTS "OrganizationMemberProperty_assignedById_idx"
  ON "OrganizationMemberProperty" ("assignedById");

CREATE TABLE IF NOT EXISTS "PersonnelDocument" (
  "id" TEXT PRIMARY KEY,
  "organizationMemberId" TEXT NOT NULL,
  "documentType" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(150) NOT NULL,
  "sizeBytes" INTEGER,
  "storagePath" TEXT NOT NULL,
  "expiryDate" DATE,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonnelDocument_organizationMemberId_fkey"
    FOREIGN KEY ("organizationMemberId") REFERENCES "OrganizationMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonnelDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS
  "PersonnelDocument_organizationMemberId_createdAt_idx"
  ON "PersonnelDocument" ("organizationMemberId", "createdAt");

COMMIT;
