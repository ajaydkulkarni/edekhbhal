from pathlib import Path
import shutil

root=Path(".")
payload=Path("payload")
for src in payload.rglob("*"):
    if not src.is_file(): continue
    rel=src.relative_to(payload)
    if str(rel)=="extra-modern.css" or str(rel).startswith("sql/"): continue
    dst=root/rel
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)

css=root/"src/app/modern.css"
extra=(payload/"extra-modern.css").read_text()
text=css.read_text()
if "/* eDekhbhal Next Preview 01 */" not in text:
    css.write_text(text+"\n\n"+extra+"\n")

schema=root/"prisma/schema.prisma"
s=schema.read_text()
if "enum EntitlementType" not in s:
    s=s.replace("enum ScheduleFrequencyType {","enum EntitlementType {\n  FEATURE\n  LIMIT\n}\n\nenum ScheduleFrequencyType {")
if "occurrenceTasksCompleted" not in s:
    s=s.replace('  occurrenceEvidenceCaptured      ScheduleOccurrenceEvidence[] @relation("OccurrenceEvidenceCapturedBy")','  occurrenceEvidenceCaptured      ScheduleOccurrenceEvidence[] @relation("OccurrenceEvidenceCapturedBy")\n  occurrenceTasksCompleted         ScheduleOccurrenceTask[]     @relation("OccurrenceTaskCompletedBy")')
if "entitlements" not in s:
    s=s.replace("  translations        ContentTranslation[]","  translations        ContentTranslation[]\n  entitlements         OrganizationEntitlement[]")
if "isAdHoc" not in s:
    s=s.replace("  descriptionHtml String                   @db.Text\n  status","  descriptionHtml String                   @db.Text\n  isAdHoc         Boolean                  @default(false)\n  status")
if "completedById" not in s:
    s=s.replace("  actualDurationSeconds   Int?\n  createdAt","  actualDurationSeconds   Int?\n  completedById           String?\n  completedBy             User?                        @relation(\"OccurrenceTaskCompletedBy\", fields: [completedById], references: [id], onDelete: SetNull)\n  createdAt")
    s=s.replace("  @@unique([occurrenceId, sequence])","  @@unique([occurrenceId, sequence])\n  @@index([completedById])")
if "model OrganizationEntitlement" not in s:
    idx=s.find("model Subscription {")
    if idx<0: raise SystemExit("Patch stopped: Subscription model not found")
    model='model OrganizationEntitlement {\n  id             String          @id @default(cuid())\n  organizationId String\n  code           String          @db.VarChar(120)\n  type           EntitlementType\n  enabled        Boolean         @default(true)\n  limitValue     Int?\n  startsAt       DateTime?\n  endsAt         DateTime?\n  metadata       Json?\n  createdAt      DateTime        @default(now())\n  updatedAt      DateTime        @updatedAt\n  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)\n\n  @@unique([organizationId, code])\n  @@index([organizationId, type])\n}\n\n'
    s=s[:idx]+model+s[idx:]
schema.write_text(s)

context=root/"PROJECT-CONTEXT.md"
ct=context.read_text()
note='## eDekhbhal Next Preview 01 — Clean-sheet experience transition\n- Product direction changed from continued fine-tuning to a clean-sheet redesign while preserving proven domain rules and the working implementation as reference.\n- Preview 01 introduces a polished public landing page with an embedded product explainer video and functional Login/Register CTAs.\n- Schedule creation now supports Task Library items and ad-hoc Tasks. Ad-hoc Tasks default to Schedule-only hidden definitions and can optionally be saved into the reusable Task Library.\n- Hidden ad-hoc Tasks use `Task.isAdHoc=true`; they remain fully executable and historically snapshot into occurrences without cluttering the Task Library.\n- Public Work Area QR now exposes the latest completed service with task-level Task, completed-by display name, start, end, scheduled duration, actual duration, variance and variance percentage, plus the previous two completion date/times with expandable details.\n- `ScheduleOccurrenceTask.completedById` records the actual mobile user completing each Task for accurate public service attribution.\n- Added entitlement foundation supporting future feature-based and limit-based subscriptions. Billing is intentionally not implemented yet.\n- Web visual system and Schedule Builder receive the first Next-generation design treatment.\n- Mobile design tokens and bottom navigation receive the first Next-generation visual treatment; existing execution/scan/report/profile workflows remain functional.\n- RLS is not enabled by this preview.'
if "## eDekhbhal Next Preview 01" not in ct:
    context.write_text(ct+"\n\n"+note+"\n")
print("eDekhbhal Next Preview 01 applied.")
