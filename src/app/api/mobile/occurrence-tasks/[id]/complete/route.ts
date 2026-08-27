import { ActionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";
import {
  occurrenceDto,
  occurrenceInclude,
  secondsBetween
} from "@/lib/mobileExecution";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership } = await requireMobileMembership(req);

    const task = await prisma.scheduleOccurrenceTask.findFirst({
      where: {
        id,
        occurrence: {
          organizationId: membership.organizationId,
          assignedUserId: user.id,
          status: "IN_PROGRESS"
        }
      },
      include: {
        evidence: true,
        occurrence: {
          include: {
            tasks: { orderBy: { sequence: "asc" } }
          }
        }
      }
    });

    if (!task) throw new MobileApiError(404, "NOT_FOUND", "Active Task not found.");
    if (task.status !== "IN_PROGRESS" || !task.actualStartAt) {
      throw new MobileApiError(409, "TASK_NOT_ACTIVE", "This Task is not currently active.");
    }

    if (task.evidenceRequired) {
      const evidence = task.evidence[0];
      if (!evidence) {
        throw new MobileApiError(
          409,
          "EVIDENCE_REQUIRED",
          "Capture and save the required evidence before completing this Task."
        );
      }
      if (
        task.evidenceTypeRequired &&
        task.evidenceTypeRequired !== "EITHER" &&
        evidence.type !== task.evidenceTypeRequired
      ) {
        throw new MobileApiError(
          409,
          "EVIDENCE_REQUIRED",
          `This Task requires ${task.evidenceTypeRequired.toLowerCase()} evidence.`
        );
      }
    }

    const now = new Date();
    const actualDurationSeconds = secondsBetween(task.actualStartAt, now);
    const actualDurationMinutes = Math.max(0, Math.round(actualDurationSeconds / 60));
    const currentIndex = task.occurrence.tasks.findIndex((item) => item.id === task.id);
    const nextTask = task.occurrence.tasks[currentIndex + 1] ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const completed = await tx.scheduleOccurrenceTask.updateMany({
        where: { id: task.id, status: "IN_PROGRESS" },
        data: {
          status: "COMPLETED",
          actualEndAt: now,
          actualDurationSeconds,
          actualDurationMinutes
        }
      });

      if (completed.count !== 1) {
        throw new MobileApiError(409, "TASK_ALREADY_COMPLETED", "This Task was already completed.");
      }

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.TASK_EXECUTION_COMPLETED,
        entityType: "ScheduleOccurrenceTask",
        entityId: task.id,
        metadata: {
          occurrenceId: task.occurrenceId,
          sequence: task.sequence,
          plannedDurationMinutes: task.plannedDurationMinutes,
          actualDurationSeconds,
          evidenceRequired: task.evidenceRequired,
          evidenceCaptured: task.evidence.length > 0
        }
      }, tx);

      if (nextTask) {
        const startedNext = await tx.scheduleOccurrenceTask.updateMany({
          where: { id: nextTask.id, status: "PENDING" },
          data: {
            status: "IN_PROGRESS",
            actualStartAt: now
          }
        });
        if (startedNext.count !== 1) {
          throw new MobileApiError(409, "NEXT_TASK_NOT_STARTABLE", "The next Task could not be started safely.");
        }

        await audit({
          organizationId: membership.organizationId,
          userId: user.id,
          action: ActionType.TASK_EXECUTION_STARTED,
          entityType: "ScheduleOccurrenceTask",
          entityId: nextTask.id,
          metadata: {
            occurrenceId: task.occurrenceId,
            sequence: nextTask.sequence,
            startedAt: now.toISOString()
          }
        }, tx);
      } else {
        const occurrenceStart = task.occurrence.startedAt ?? now;
        const scheduleDurationSeconds = secondsBetween(occurrenceStart, now);

        await tx.scheduleOccurrence.update({
          where: { id: task.occurrenceId },
          data: {
            status: "COMPLETED",
            completedAt: now,
            actualDurationSeconds: scheduleDurationSeconds,
            claimExpiresAt: null
          }
        });

        await audit({
          organizationId: membership.organizationId,
          userId: user.id,
          action: ActionType.SCHEDULE_EXECUTION_COMPLETED,
          entityType: "ScheduleOccurrence",
          entityId: task.occurrenceId,
          metadata: {
            plannedDurationMinutes: task.occurrence.plannedDurationMinutes,
            actualDurationSeconds: scheduleDurationSeconds,
            taskCount: task.occurrence.tasks.length
          }
        }, tx);
      }

      return tx.scheduleOccurrence.findUniqueOrThrow({
        where: { id: task.occurrenceId },
        include: occurrenceInclude
      });
    });

    return Response.json({
      occurrence: occurrenceDto(result),
      scheduleCompleted: result.status === "COMPLETED"
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
