#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$ROOT/package.json" ] || [ ! -f "$ROOT/prisma/schema.prisma" ]; then
  echo "Run this script from the eDekhbhal repository root."; exit 1
fi
if [ ! -d "$PACKAGE_DIR/batch-files" ]; then echo "batch-files payload folder not found."; exit 1; fi
cp -a "$PACKAGE_DIR/batch-files/." "$ROOT/"

python3 - <<'PY'
from pathlib import Path
import re

p=Path("prisma/schema.prisma")
text=p.read_text()

needle='''  status         Status @default(ACTIVE)
  createdAt      DateTime @default(now())'''
replacement='''  status         Status @default(ACTIVE)
  addressLine1   String?
  addressLine2   String?
  addressLine3   String?
  city           String?
  state          String?
  postalCode     String?
  country        String?
  mobilePhone    String?
  residencePhone String?
  alternatePhone String?
  notes          String? @db.Text
  photoStoragePath String? @db.Text
  propertyAssignments OrganizationMemberProperty[]
  personnelDocuments PersonnelDocument[]
  createdAt      DateTime @default(now())'''
if needle not in text: raise SystemExit("OrganizationMember insertion point not found.")
text=text.replace(needle,replacement,1)

needle='''  occurrenceNotesCreated ScheduleOccurrenceNote[] @relation("OccurrenceNoteCreatedBy")
}'''
replacement='''  occurrenceNotesCreated ScheduleOccurrenceNote[] @relation("OccurrenceNoteCreatedBy")
  propertyAssignmentsMade OrganizationMemberProperty[] @relation("PropertyAssignmentMadeBy")
  personnelDocumentsUploaded PersonnelDocument[] @relation("PersonnelDocumentUploadedBy")
}'''
if needle not in text: raise SystemExit("User relation insertion point not found.")
text=text.replace(needle,replacement,1)

needle='''  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  workAreas      WorkArea[]
  @@index([organizationId])
}'''
replacement='''  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  workAreas      WorkArea[]
  memberAssignments OrganizationMemberProperty[]
  @@index([organizationId])
}'''
if needle not in text: raise SystemExit("Property relation insertion point not found.")
text=text.replace(needle,replacement,1)

models=r'''
model OrganizationMemberProperty {
  id                   String @id @default(cuid())
  organizationMemberId String
  propertyId           String
  assignedById         String
  assignedAt           DateTime @default(now())
  member               OrganizationMember @relation(fields: [organizationMemberId], references: [id], onDelete: Cascade)
  property             Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  assignedBy           User @relation("PropertyAssignmentMadeBy", fields: [assignedById], references: [id], onDelete: Restrict)

  @@unique([organizationMemberId, propertyId])
  @@index([propertyId])
  @@index([assignedById])
}

model PersonnelDocument {
  id                   String @id @default(cuid())
  organizationMemberId String
  documentType         String @db.VarChar(100)
  description          String @db.VarChar(500)
  fileName             String @db.VarChar(255)
  mimeType             String @db.VarChar(150)
  sizeBytes            Int?
  storagePath          String @db.Text
  expiryDate           DateTime? @db.Date
  uploadedById         String
  createdAt            DateTime @default(now())
  member               OrganizationMember @relation(fields: [organizationMemberId], references: [id], onDelete: Cascade)
  uploadedBy           User @relation("PersonnelDocumentUploadedBy", fields: [uploadedById], references: [id], onDelete: Restrict)

  @@index([organizationMemberId, createdAt])
}

'''
marker="\nmodel Property {\n"
if marker not in text: raise SystemExit("Property model marker not found.")
text=text.replace(marker,"\n"+models+marker,1)
p.write_text(text)

p=Path("PROJECT-CONTEXT.md"); text=p.read_text()
text=re.sub(r"\*\*Last updated:\*\*.*","**Last updated:** 2026-08-29",text,count=1)
text=re.sub(r"\*\*Current deployment status:\*\*.*","**Current deployment status:** v0.9.1 is deployed and validated in staging. Fine-tuning Batch 01 (Audit Trail + Personnel Profiles + Property Assignments + first-stage property-scope enforcement) is prepared for staging validation. RLS is intentionally deferred until application-level property scoping passes role regression.",text,count=1)

section=r'''

---

## Fine-tuning Batch 01 — Audit, Personnel & Property Access Foundation

This batch is intentionally **not** a semantic version bump. The application remains v0.9.1 until the broader access-control work, including the RLS security gate, is validated and ready to become the next meaningful release.

### Audit Trail
- Date/User/Action/Entity filters, global search, pagination and sorting.
- CSV/XLSX export respects active filters/search.

### Personnel Profiles
- Name, address, phones, Role, Status and internal Notes.
- Private profile picture upload with browser camera capture when available.
- Multiple verification documents with type, description, optional expiry and signed private access.
- User self-service never exposes internal Notes.
- Property Managers may maintain User personnel details only within their assigned scope.
- Role, Status and Property assignment remain Admin controls.

### Property Assignments
- Many-to-many OrganizationMember ↔ Property assignment.
- Admin can assign multiple Properties from Team profile or Property → Team Assignments.
- Admin has Organization-wide access.
- Property Manager and User access is assignment-based.
- User with no assigned Property gets no available mobile work.
- Property master-data create/edit is Admin-only; Property Manager sees assigned Property master data read-only.

### RLS security gate
RLS is deliberately not enabled in this batch. First validate application-level Admin / Property Manager / User property scoping in staging. Then complete remaining endpoint scoping and introduce RLS in staging with an appropriate non-bypass runtime role / request context before the next release is production-ready.
'''
if "## Fine-tuning Batch 01 — Audit, Personnel & Property Access Foundation" not in text:text+=section
p.write_text(text)
PY

echo "Fine-tuning Batch 01 applied."
echo "Next: bash CHECK-finetune-batch-01.sh"
