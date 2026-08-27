import { ActionType, Prisma, ScheduleOccurrenceStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { audit } from "./audit";

export const occurrenceInclude = {
  schedule: { select: { id: true, name: true } },
  workArea: {
    include: {
      property: {
        select: { id: true, name: true }
      }
    }
  },
  assignedUser: { select: { id: true, name: true, email: true } },
  tasks: {
    orderBy: { sequence: "asc" as const },
    include: {
      evidence: { orderBy: { capturedAt: "asc" as const } },
      notes: {
        orderBy: { createdAt: "asc" as const },
        include: { createdBy: { select: { id: true, name: true, email: true } } }
      }
    }
  },
  notes: {
    where: { scope: "SCHEDULE" as const },
    orderBy: { createdAt: "asc" as const },
    include: { createdBy: { select: { id: true, name: true, email: true } } }
  }
} satisfies Prisma.ScheduleOccurrenceInclude;

export type OccurrenceWithExecution = Prisma.ScheduleOccurrenceGetPayload<{
  include: typeof occurrenceInclude;
}>;

export function occurrenceDto(occurrence: OccurrenceWithExecution) {
  const currentTask =
    occurrence.tasks.find((task) => task.status === "IN_PROGRESS") ??
    occurrence.tasks.find((task) => task.status === "PENDING") ??
    null;

  return {
    id: occurrence.id,
    scheduleId: occurrence.scheduleId,
    scheduleName: occurrence.scheduleNameSnapshot,
    workAreaId: occurrence.workAreaId,
    workAreaName: occurrence.workAreaNameSnapshot,
    propertyId: occurrence.workArea.property.id,
    propertyName: occurrence.propertyNameSnapshot,
    scheduledStartAt: occurrence.scheduledStartAt.toISOString(),
    scheduledEndAt: occurrence.scheduledEndAt.toISOString(),
    timezone: occurrence.timezone,
    plannedDurationMinutes: occurrence.plannedDurationMinutes,
    status: occurrence.status,
    assignedUserId: occurrence.assignedUserId,
    claimedAt: occurrence.claimedAt?.toISOString() ?? null,
    claimExpiresAt: occurrence.claimExpiresAt?.toISOString() ?? null,
    startedAt: occurrence.startedAt?.toISOString() ?? null,
    completedAt: occurrence.completedAt?.toISOString() ?? null,
    actualDurationSeconds: occurrence.actualDurationSeconds,
    taskCount: occurrence.tasks.length,
    completedTaskCount: occurrence.tasks.filter((task) => task.status === "COMPLETED").length,
    currentTaskId: currentTask?.id ?? null,
    tasks: occurrence.tasks.map((task) => ({
      id: task.id,
      sourceTaskId: task.taskId,
      sequence: task.sequence,
      name: task.taskNameSnapshot,
      descriptionHtml: task.taskDescriptionSnapshot,
      plannedDurationMinutes: task.plannedDurationMinutes,
      plannedStartAt: task.plannedStartAt.toISOString(),
      plannedEndAt: task.plannedEndAt.toISOString(),
      evidenceRule: task.evidenceRuleSnapshot,
      evidenceRequired: task.evidenceRequired,
      evidenceTypeRequired: task.evidenceTypeRequired,
      status: task.status,
      actualStartAt: task.actualStartAt?.toISOString() ?? null,
      actualEndAt: task.actualEndAt?.toISOString() ?? null,
      actualDurationSeconds: task.actualDurationSeconds,
      evidence: task.evidence.map((evidence) => ({
        id: evidence.id,
        type: evidence.type,
        mimeType: evidence.mimeType,
        sizeBytes: evidence.sizeBytes,
        capturedAt: evidence.capturedAt.toISOString(),
        storagePath: evidence.storagePath
      })),
      notes: task.notes.map((note) => ({
        id: note.id,
        note: note.note,
        createdAt: note.createdAt.toISOString(),
        createdBy: note.createdBy.name ?? note.createdBy.email
      }))
    })),
    notes: occurrence.notes.map((note) => ({
      id: note.id,
      note: note.note,
      createdAt: note.createdAt.toISOString(),
      createdBy: note.createdBy.name ?? note.createdBy.email
    }))
  };
}

export async function getOccurrenceForUser(occurrenceId: string, organizationId: string, userId: string) {
  return prisma.scheduleOccurrence.findFirst({
    where: {
      id: occurrenceId,
      organizationId,
      assignedUserId: userId
    },
    include: occurrenceInclude
  });
}

export async function releaseExpiredClaims(organizationId: string) {
  const now = new Date();
  const expired = await prisma.scheduleOccurrence.findMany({
    where: {
      organizationId,
      status: "PENDING",
      assignedUserId: { not: null },
      claimExpiresAt: { lt: now }
    },
    select: {
      id: true,
      assignedUserId: true,
      claimedAt: true,
      claimExpiresAt: true,
      scheduleNameSnapshot: true
    }
  });

  for (const item of expired) {
    await prisma.$transaction(async (tx) => {
      const result = await tx.scheduleOccurrence.updateMany({
        where: {
          id: item.id,
          status: "PENDING",
          assignedUserId: item.assignedUserId,
          claimExpiresAt: { lt: now }
        },
        data: {
          assignedUserId: null,
          claimedAt: null,
          claimExpiresAt: null
        }
      });

      if (result.count) {
        await audit({
          organizationId,
          userId: item.assignedUserId,
          action: ActionType.SCHEDULE_CLAIM_EXPIRED,
          entityType: "ScheduleOccurrence",
          entityId: item.id,
          metadata: {
            scheduleName: item.scheduleNameSnapshot,
            claimedAt: item.claimedAt?.toISOString() ?? null,
            claimExpiredAt: item.claimExpiresAt?.toISOString() ?? null
          }
        }, tx);
      }
    });
  }

  return expired.length;
}

export async function activeOccurrenceForUser(organizationId: string, userId: string) {
  const now = new Date();
  return prisma.scheduleOccurrence.findFirst({
    where: {
      organizationId,
      assignedUserId: userId,
      OR: [
        { status: "IN_PROGRESS" },
        {
          status: "PENDING",
          OR: [
            { claimExpiresAt: null },
            { claimExpiresAt: { gt: now } }
          ]
        }
      ]
    },
    include: occurrenceInclude,
    orderBy: [{ status: "desc" }, { scheduledStartAt: "asc" }]
  });
}

export function parseQrId(scannedValue: string) {
  const value = scannedValue.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const qrIndex = parts.lastIndexOf("qr");
    if (qrIndex >= 0 && parts[qrIndex + 1]) return decodeURIComponent(parts[qrIndex + 1]);
  } catch {
    // Accept a raw QR database id for controlled testing.
  }
  return value;
}

export function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}
