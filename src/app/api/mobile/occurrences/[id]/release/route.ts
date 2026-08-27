import { ActionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership } = await requireMobileMembership(req);

    const occurrence = await prisma.scheduleOccurrence.findFirst({
      where: {
        id,
        organizationId: membership.organizationId,
        assignedUserId: user.id
      }
    });

    if (!occurrence) throw new MobileApiError(404, "NOT_FOUND", "Claimed Schedule not found.");
    if (occurrence.status !== "PENDING") {
      throw new MobileApiError(
        409,
        "CANNOT_RELEASE_STARTED_WORK",
        "Work that has already started cannot be returned to the queue."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleOccurrence.update({
        where: { id },
        data: {
          assignedUserId: null,
          claimedAt: null,
          claimExpiresAt: null
        }
      });

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.SCHEDULE_CLAIM_RELEASED,
        entityType: "ScheduleOccurrence",
        entityId: id,
        metadata: {
          reason: "user_released_before_qr_scan"
        }
      }, tx);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
