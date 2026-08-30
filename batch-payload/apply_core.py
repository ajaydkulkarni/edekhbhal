from pathlib import Path
import re, shutil

def once(text, old, new, label):
    if old in text:
        return text.replace(old,new,1)
    if new in text:
        return text
    raise SystemExit(f"Patch stopped: {label} not found")

def cp(rel):
    src=Path("batch-payload")/rel; dst=Path(rel); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)

for rel in [
 "src/lib/audit.ts",
 "src/app/audit/page.tsx",
 "src/components/PropertyTeamAssignments.tsx",
 "src/components/ReportedWorkActions.tsx",
 "src/app/api/reported-work/[id]/dismiss/route.ts",
 "src/app/reports/page.tsx",
 "src/app/reports/reported-work/page.tsx",
 "src/app/api/mobile/occurrence-tasks/[id]/notes/route.ts",
 "src/app/api/mobile/occurrences/[id]/notes/route.ts",
 "src/app/schedules/new/page.tsx",
 "src/app/api/e2e/reported-work/route.ts",
 "e2e/reported-work.spec.ts",
 "e2e/fine-tuning-ui.spec.ts"
]: cp(rel)

# Prisma schema
p=Path("prisma/schema.prisma"); t=p.read_text()
t=once(t,"""enum OccurrenceNoteScope {
  SCHEDULE
  TASK
}
""","""enum OccurrenceNoteScope {
  SCHEDULE
  TASK
}

enum ReportedWorkStatus {
  NEW
  DISMISSED
  SCHEDULE_CREATED
}
""","ReportedWorkStatus enum")
t=once(t,"""  TASK_NOTE_ADDED
  SCHEDULE_NOTE_ADDED
  EVIDENCE_CAPTURED
""","""  TASK_NOTE_ADDED
  SCHEDULE_NOTE_ADDED
  REPORTED_WORK_ITEM_CREATED
  REPORTED_WORK_ITEM_DISMISSED
  REPORTED_WORK_ITEM_SCHEDULE_LINKED
  EVIDENCE_CAPTURED
""","ActionType additions")
t=once(t,'  occurrenceNotesCreated ScheduleOccurrenceNote[] @relation("OccurrenceNoteCreatedBy")\n  propertyAssignmentsMade','  occurrenceNotesCreated ScheduleOccurrenceNote[] @relation("OccurrenceNoteCreatedBy")\n  reportedWorkItemsCreated ReportedWorkItem[] @relation("ReportedWorkReportedBy")\n  reportedWorkItemsDismissed ReportedWorkItem[] @relation("ReportedWorkDismissedBy")\n  reportedWorkItemsScheduleLinked ReportedWorkItem[] @relation("ReportedWorkScheduleLinkedBy")\n  propertyAssignmentsMade',"User relations")
t=once(t,"  scheduleOccurrences ScheduleOccurrence[]\n  translations ContentTranslation[]","  scheduleOccurrences ScheduleOccurrence[]\n  reportedWorkItems ReportedWorkItem[]\n  translations ContentTranslation[]","Organization relation")
t=once(t,"  memberAssignments OrganizationMemberProperty[]\n  @@index([organizationId])","  memberAssignments OrganizationMemberProperty[]\n  reportedWorkItems ReportedWorkItem[]\n  @@index([organizationId])","Property relation")
t=once(t,"  scheduleOccurrences ScheduleOccurrence[]\n  @@index([propertyId])","  scheduleOccurrences ScheduleOccurrence[]\n  reportedWorkItems ReportedWorkItem[]\n  @@index([propertyId])","WorkArea relation")
t=once(t,"  occurrences        ScheduleOccurrence[]\n\n  @@index([organizationId, status])","  occurrences        ScheduleOccurrence[]\n  reportedWorkItems  ReportedWorkItem[]\n\n  @@index([organizationId, status])","Schedule relation")
t=once(t,'  createdBy        User                       @relation("OccurrenceNoteCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)\n\n  @@index([occurrenceId, createdAt])','  createdBy        User                       @relation("OccurrenceNoteCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)\n  reportedWorkItem ReportedWorkItem?\n\n  @@index([occurrenceId, createdAt])',"Note relation")
model="""model ReportedWorkItem {
  id                 String             @id @default(cuid())
  organizationId     String
  propertyId         String
  workAreaId         String
  sourceNoteId       String             @unique
  noteScope          OccurrenceNoteScope
  noteText           String             @db.Text
  sourceTaskName     String?            @db.VarChar(500)
  sourceScheduleName String?            @db.VarChar(500)
  reportedById       String
  reportedAt         DateTime           @default(now())
  status             ReportedWorkStatus @default(NEW)
  dismissedAt        DateTime?
  dismissedById      String?
  linkedScheduleId   String?
  scheduleLinkedAt   DateTime?
  scheduleLinkedById String?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  property           Property @relation(fields: [propertyId], references: [id], onDelete: Restrict)
  workArea           WorkArea @relation(fields: [workAreaId], references: [id], onDelete: Restrict)
  sourceNote         ScheduleOccurrenceNote @relation(fields: [sourceNoteId], references: [id], onDelete: Cascade)
  reportedBy         User @relation("ReportedWorkReportedBy", fields: [reportedById], references: [id], onDelete: Restrict)
  dismissedBy        User? @relation("ReportedWorkDismissedBy", fields: [dismissedById], references: [id], onDelete: SetNull)
  linkedSchedule     Schedule? @relation(fields: [linkedScheduleId], references: [id], onDelete: SetNull)
  scheduleLinkedBy   User? @relation("ReportedWorkScheduleLinkedBy", fields: [scheduleLinkedById], references: [id], onDelete: SetNull)
  @@index([organizationId, status, reportedAt])
  @@index([propertyId, status, reportedAt])
  @@index([workAreaId, reportedAt])
  @@index([reportedById, reportedAt])
  @@index([linkedScheduleId])
}

"""
if "model ReportedWorkItem {" not in t:t=t.replace("model ScheduleOccurrenceEvidence {",model+"model ScheduleOccurrenceEvidence {",1)
p.write_text(t)

# Schedule editor defaults
p=Path("src/components/ScheduleEditor.tsx");t=p.read_text()
t=once(t,"""  initial
}: {
  canManage: boolean;
  workAreas: WorkAreaOption[];
  tasks: TaskOption[];
  initial?: InitialSchedule;
}) {""","""  initial,
  defaults
}: {
  canManage: boolean;
  workAreas: WorkAreaOption[];
  tasks: TaskOption[];
  initial?: InitialSchedule;
  defaults?: { workAreaId?: string; reportedWorkItemId?: string; suggestedName?: string };
}) {""","ScheduleEditor props")
t=once(t,'const [name, setName] = useState(initial?.name ?? "");','const [name, setName] = useState(initial?.name ?? defaults?.suggestedName ?? "");',"ScheduleEditor name")
t=once(t,'const [workAreaId, setWorkAreaId] = useState(initial?.workAreaId ?? (workAreas.find((w) => w.status === "ACTIVE" && w.propertyStatus === "ACTIVE")?.id ?? ""));','const [workAreaId, setWorkAreaId] = useState(initial?.workAreaId ?? defaults?.workAreaId ?? (workAreas.find((w) => w.status === "ACTIVE" && w.propertyStatus === "ACTIVE")?.id ?? ""));',"ScheduleEditor workArea")
t=once(t,'        workAreaId,\n        tasks:','        workAreaId,\n        reportedWorkItemId: initial ? undefined : (defaults?.reportedWorkItemId ?? null),\n        tasks:',"ScheduleEditor source report")
p.write_text(t)

# Schedule POST: enforce PM property scope and link report
p=Path("src/app/api/schedules/route.ts");t=p.read_text()
t=once(t,'import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";','import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";\nimport { canAccessProperty } from "@/lib/propertyAccess";',"schedule propertyAccess import")
t=once(t,'  workAreaId: z.string().min(1),\n  tasks:','  workAreaId: z.string().min(1),\n  reportedWorkItemId: z.string().min(1).nullable().optional(),\n  tasks:',"schedule schema source")
anchor="""    if (workArea.status !== "ACTIVE" || workArea.property.status !== "ACTIVE") {
      return NextResponse.json({ error: "Schedules can only be created for active Work Areas under active Properties." }, { status: 409 });
    }

    const uniqueTaskIds"""
replacement="""    if (workArea.status !== "ACTIVE" || workArea.property.status !== "ACTIVE") {
      return NextResponse.json({ error: "Schedules can only be created for active Work Areas under active Properties." }, { status: 409 });
    }
    if (!(await canAccessProperty(membership, workArea.propertyId))) {
      return NextResponse.json({ error: "Work Area not found in your assigned Properties." }, { status: 404 });
    }
    const reportedWorkItem = input.reportedWorkItemId ? await prisma.reportedWorkItem.findFirst({ where: { id: input.reportedWorkItemId, organizationId: membership.organizationId } }) : null;
    if (input.reportedWorkItemId && (!reportedWorkItem || reportedWorkItem.workAreaId !== workArea.id || reportedWorkItem.propertyId !== workArea.propertyId || reportedWorkItem.linkedScheduleId)) {
      return NextResponse.json({ error: "Reported work item is unavailable or does not match this Work Area." }, { status: 409 });
    }

    const uniqueTaskIds"""
t=once(t,anchor,replacement,"schedule report validation")
anchor="""      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: "SCHEDULE_CREATED","""
replacement="""      if (reportedWorkItem) {
        await tx.reportedWorkItem.update({ where: { id: reportedWorkItem.id }, data: { status: "SCHEDULE_CREATED", linkedScheduleId: created.id, scheduleLinkedAt: new Date(), scheduleLinkedById: user.id } });
        await audit({ organizationId: membership.organizationId, userId: user.id, action: "REPORTED_WORK_ITEM_SCHEDULE_LINKED", entityType: "ReportedWorkItem", entityId: reportedWorkItem.id, oldValue: { status: reportedWorkItem.status, dismissedAt: reportedWorkItem.dismissedAt?.toISOString() ?? null }, newValue: { status: "SCHEDULE_CREATED", linkedScheduleId: created.id }, metadata: { propertyId: reportedWorkItem.propertyId, workAreaId: reportedWorkItem.workAreaId } }, tx);
      }

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: "SCHEDULE_CREATED","""
t=once(t,anchor,replacement,"schedule report linking")
p.write_text(t)

# Dashboard API: add scope and reported work to Attention
p=Path("src/app/api/dashboard/live/route.ts");t=p.read_text()
t=once(t,'import { createEvidenceSignedDownload } from "@/lib/supabaseStorage";','import { createEvidenceSignedDownload } from "@/lib/supabaseStorage";\nimport { assignedPropertyIds } from "@/lib/propertyAccess";',"dashboard property import")
t=once(t,"""  const organizationId = membership.organizationId;
  const timeZone = membership.organization.timezone;""","""  const organizationId = membership.organizationId;
  const propertyScopeIds = await assignedPropertyIds(membership);
  const occurrenceScope = propertyScopeIds ? { workArea: { propertyId: { in: propertyScopeIds } } } : {};
  const timeZone = membership.organization.timezone;""","dashboard scope vars")
t=once(t,'where: { organizationId, status: "ACTIVE", role: "USER" },','where: { organizationId, status: "ACTIVE", role: "USER", ...(propertyScopeIds ? { propertyAssignments: { some: { propertyId: { in: propertyScopeIds } } } } : {}) },',"dashboard members scope")
t=once(t,'  const [activeOccurrences, loginEvents, completedToday, progressRows, feedRows, evidenceRows, attentionRows] = await Promise.all([','  const [activeOccurrences, loginEvents, completedToday, progressRows, feedRows, evidenceRows, attentionRows, reportedRows] = await Promise.all([',"dashboard Promise list")
# scope occurrence queries by targeted replacements
t=t.replace('        organizationId,\n        status: "IN_PROGRESS",','        organizationId,\n        ...occurrenceScope,\n        status: "IN_PROGRESS",',1)
t=t.replace('occurrence: { organizationId },','occurrence: { organizationId, ...occurrenceScope },',1)
t=t.replace('where: { organizationId, scheduledStartAt: { gte: startOfDay, lt: endOfDay } },','where: { organizationId, ...occurrenceScope, scheduledStartAt: { gte: startOfDay, lt: endOfDay } },',1)
t=t.replace('occurrence: { organizationId },','occurrence: { organizationId, ...occurrenceScope },',1)
t=t.replace('where: { occurrenceTask: { occurrence: { organizationId } } },','where: { occurrenceTask: { occurrence: { organizationId, ...occurrenceScope } } },',1)
# attention scope and append report query
att="""      where: {
        organizationId,
        OR: ["""
if att in t:t=t.replace(att,"""      where: {
        organizationId,
        ...occurrenceScope,
        OR: [""",1)
tail="""      orderBy: { scheduledStartAt: "asc" },
      take: 10,
    }),
  ]);"""
newtail="""      orderBy: { scheduledStartAt: "asc" },
      take: 10,
    }),
    prisma.reportedWorkItem.findMany({
      where: { organizationId, status: "NEW", ...(propertyScopeIds ? { propertyId: { in: propertyScopeIds } } : {}) },
      include: { property: { select: { name: true } }, workArea: { select: { name: true } }, reportedBy: { select: { name: true, email: true } } },
      orderBy: { reportedAt: "desc" },
      take: 20
    }),
  ]);"""
t=once(t,tail,newtail,"dashboard report query")
old="""  const attention = attentionRows.map((item) => ({
    id: item.id,
    status: item.status,
    scheduleName: item.scheduleNameSnapshot,
    propertyName: item.propertyNameSnapshot,
    workAreaName: item.workAreaNameSnapshot,
    scheduledStartAt: item.scheduledStartAt.toISOString(),
    scheduledEndAt: item.scheduledEndAt.toISOString(),
    userName: item.assignedUser?.name ?? item.assignedUser?.email ?? null,
  }));"""
new="""  const scheduleAttention = attentionRows.map((item) => ({ kind: "SCHEDULE" as const, id: item.id, status: item.status, scheduleName: item.scheduleNameSnapshot, propertyName: item.propertyNameSnapshot, workAreaName: item.workAreaNameSnapshot, scheduledStartAt: item.scheduledStartAt.toISOString(), scheduledEndAt: item.scheduledEndAt.toISOString(), userName: item.assignedUser?.name ?? item.assignedUser?.email ?? null, propertyId: null, workAreaId: item.workAreaId, note: null, reportedAt: null, reportedBy: null }));
  const reportedAttention = reportedRows.map((item) => ({ kind: "REPORTED_WORK" as const, id: item.id, status: item.status, scheduleName: item.sourceScheduleName ?? (item.noteScope === "TASK" ? item.sourceTaskName ?? "Task Note" : "Schedule Note"), propertyName: item.property.name, workAreaName: item.workArea.name, scheduledStartAt: item.reportedAt.toISOString(), scheduledEndAt: item.reportedAt.toISOString(), userName: null, propertyId: item.propertyId, workAreaId: item.workAreaId, note: item.noteText, reportedAt: item.reportedAt.toISOString(), reportedBy: item.reportedBy.name ?? item.reportedBy.email }));
  const attention = [...reportedAttention, ...scheduleAttention];"""
t=once(t,old,new,"dashboard attention mapping")
t=once(t,"overdueOrMissed: progress.overdue + progress.missed + progress.partial,","overdueOrMissed: progress.overdue + progress.missed + progress.partial + reportedRows.length,","dashboard attention KPI")
p.write_text(t)

print("Core model/API patches applied.")
