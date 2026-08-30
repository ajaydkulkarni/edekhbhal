import { ActionType } from "@prisma/client";
import { z } from "zod";
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
  parseQrId
} from "@/lib/mobileExecution";

const schema = z.object({
  scannedValue: z.string().min(1).max(3000)
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership } = await requireMobileMembership(req);
    const input = schema.parse(await req.json());

    const occurrence = await prisma.scheduleOccurrence.findFirst({
      where: {
        id,
        organizationId: membership.organizationId,
        assignedUserId: user.id
      },
      include: {
        tasks: { orderBy: { sequence: "asc" } }
      }
    });

    if (!occurrence) throw new MobileApiError(404, "NOT_FOUND", "Claimed Schedule not found.");

    if (occurrence.status === "IN_PROGRESS") {
      const current = await prisma.scheduleOccurrence.findUniqueOrThrow({
        where: { id },
        include: occurrenceInclude
      });
      return Response.json({ occurrence: occurrenceDto(current), alreadyStarted: true });
    }

    if (occurrence.status !== "PENDING") {
      throw new MobileApiError(409, "NOT_STARTABLE", "This Schedule cannot be started.");
    }

    const now = new Date();
    if (occurrence.claimExpiresAt && occurrence.claimExpiresAt <= now) {
      await prisma.$transaction(async (tx) => {
        await tx.scheduleOccurrence.update({
          where: { id },
          data: { assignedUserId: null, claimedAt: null, claimExpiresAt: null }
        });
        await audit({
          organizationId: membership.organizationId,
          userId: user.id,
          action: ActionType.SCHEDULE_CLAIM_EXPIRED,
          entityType: "ScheduleOccurrence",
          entityId: id,
          metadata: { detectedAtQrScan: true }
        }, tx);
      });
      throw new MobileApiError(
        409,
        "CLAIM_EXPIRED",
        "Your claim expired before the QR was scanned. Please return to My Work and claim the Schedule again."
      );
    }

    const qrId = parseQrId(input.scannedValue);
    const qr = await prisma.qrCode.findUnique({
      where: { id: qrId }
    });

    if (!qr || qr.status !== "ACTIVE") {
      throw new MobileApiError(400, "INVALID_QR", "This QR Code is invalid or no longer active.");
    }

    if (qr.workAreaId !== occurrence.workAreaId) {
      throw new MobileApiError(
        409,
        "WRONG_WORK_AREA",
        "This is not the Work Area assigned to your current Schedule."
      );
    }

    const firstTask = occurrence.tasks[0];
    if (!firstTask) {
      throw new MobileApiError(409, "NO_TASKS", "This Schedule has no executable Tasks.");
    }

    const started = await prisma.$transaction(async (tx) => {
      const updated = await tx.scheduleOccurrence.updateMany({
        where: {
          id,
          organizationId: membership.organizationId,
          assignedUserId: user.id,
          status: "PENDING"
        },
        data: {
          status: "IN_PROGRESS",
          startedAt: now,
          claimExpiresAt: null
        }
      });

      if (updated.count !== 1) return null;

      await tx.scheduleOccurrenceTask.update({
        where: { id: firstTask.id },
        data: {
          status: "IN_PROGRESS",
          actualStartAt: now
        }
      });

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.SCHEDULE_EXECUTION_STARTED,
        entityType: "ScheduleOccurrence",
        entityId: id,
        metadata: {
          qrCodeId: qr.id,
          workAreaId: occurrence.workAreaId,
          startedAt: now.toISOString(),
          scheduledStartAt: occurrence.scheduledStartAt.toISOString()
        }
      }, tx);

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.TASK_EXECUTION_STARTED,
        entityType: "ScheduleOccurrenceTask",
        entityId: firstTask.id,
        metadata: {
          occurrenceId: id,
          sequence: firstTask.sequence,
          startedAt: now.toISOString()
        }
      }, tx);

      return tx.scheduleOccurrence.findUnique({
        where: { id },
        include: occurrenceInclude
      });
    });

    if (!started) {
      throw new MobileApiError(409, "ALREADY_STARTED", "This Schedule was already started.");
    }

    return Response.json({ occurrence: occurrenceDto(started) });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
