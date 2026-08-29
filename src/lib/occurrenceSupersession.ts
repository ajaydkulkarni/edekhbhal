import { prisma } from "./prisma";
import { audit } from "./audit";

export const AUTO_MISS_REASON =
  "Automatically marked MISSED when the next scheduled occurrence became due.";

type SupersessionOptions = {
  organizationId?: string;
  scheduleId?: string;
  now?: Date;
};

/**
 * Recurring operational work follows "latest due occurrence wins".
 *
 * Occurrences are pre-generated up to 48 hours ahead, therefore the existence
 * of a later database row is NOT enough to supersede older work. A later
 * occurrence must actually have reached scheduledStartAt.
 *
 * Only unstarted PENDING occurrences are changed. IN_PROGRESS, COMPLETED,
 * PARTIALLY_COMPLETED, MISSED and CANCELED history is never rewritten.
 */
export async function supersedeDueOccurrences(options: SupersessionOptions = {}) {
  const now = options.now ?? new Date();

  const due = await prisma.scheduleOccurrence.findMany({
    where: {
      ...(options.organizationId ? { organizationId: options.organizationId } : {}),
      ...(options.scheduleId ? { scheduleId: options.scheduleId } : {}),
      scheduledStartAt: { lte: now },
      status: { not: "CANCELED" },
      schedule: {
        frequencyType: "RECURRING",
        status: "ACTIVE",
        supersedeUnstarted: true
      }
    },
    select: {
      id: true,
      organizationId: true,
      scheduleId: true,
      scheduledStartAt: true,
      status: true
    },
    orderBy: [{ scheduleId: "asc" }, { scheduledStartAt: "desc" }]
  });

  const latestDueBySchedule = new Map<string, Date>();
  for (const row of due) {
    if (!latestDueBySchedule.has(row.scheduleId)) {
      latestDueBySchedule.set(row.scheduleId, row.scheduledStartAt);
    }
  }

  const candidates = due.filter((row) => {
    const latest = latestDueBySchedule.get(row.scheduleId);
    return Boolean(
      latest &&
      row.status === "PENDING" &&
      row.scheduledStartAt.getTime() < latest.getTime()
    );
  });

  let missed = 0;

  for (const candidate of candidates) {
    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.scheduleOccurrence.updateMany({
        where: {
          id: candidate.id,
          status: "PENDING",
          startedAt: null
        },
        data: {
          status: "MISSED",
          autoMissedAt: now,
          missedReason: AUTO_MISS_REASON,
          assignedUserId: null,
          claimedAt: null,
          claimExpiresAt: null
        }
      });

      if (updated.count !== 1) return false;

      await tx.scheduleOccurrenceTask.updateMany({
        where: {
          occurrenceId: candidate.id,
          status: "PENDING"
        },
        data: { status: "MISSED" }
      });

      return true;
    });

    if (!changed) continue;
    missed++;

    await audit({
      organizationId: candidate.organizationId,
      userId: null,
      action: "SCHEDULE_OCCURRENCE_AUTO_MISSED",
      entityType: "ScheduleOccurrence",
      entityId: candidate.id,
      metadata: {
        scheduleId: candidate.scheduleId,
        supersededScheduledStartAt: candidate.scheduledStartAt.toISOString(),
        reason: AUTO_MISS_REASON,
        evaluatedAt: now.toISOString()
      }
    });
  }

  return {
    evaluatedAt: now.toISOString(),
    schedulesEvaluated: latestDueBySchedule.size,
    autoMissed: missed
  };
}
