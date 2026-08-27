import { ActionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";
import {
  activeOccurrenceForUser,
  occurrenceDto,
  occurrenceInclude,
  releaseExpiredClaims
} from "@/lib/mobileExecution";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership, organization } = await requireMobileMembership(req);
    await releaseExpiredClaims(membership.organizationId);

    const existingActive = await activeOccurrenceForUser(membership.organizationId, user.id);
    if (existingActive) {
      if (existingActive.id === id) {
        return Response.json({ occurrence: occurrenceDto(existingActive), alreadyClaimed: true });
      }
      throw new MobileApiError(
        409,
        "ACTIVE_WORK_EXISTS",
        "You already have active work. Complete or release it before claiming another Schedule."
      );
    }

    const candidate = await prisma.scheduleOccurrence.findFirst({
      where: {
        id,
        organizationId: membership.organizationId,
        status: "PENDING",
        schedule: { status: "ACTIVE" },
        workArea: {
          status: "ACTIVE",
          property: { status: "ACTIVE" }
        }
      },
      select: {
        id: true,
        assignedUserId: true,
        scheduleNameSnapshot: true,
        scheduledStartAt: true
      }
    });

    if (!candidate) {
      throw new MobileApiError(404, "OCCURRENCE_NOT_AVAILABLE", "This Schedule is no longer available.");
    }
    if (candidate.assignedUserId) {
      throw new MobileApiError(409, "ALREADY_CLAIMED", "Another user has already claimed this Schedule.");
    }

    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + organization.claimExpiryMinutes * 60_000);

    const claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.scheduleOccurrence.updateMany({
        where: {
          id,
          organizationId: membership.organizationId,
          status: "PENDING",
          assignedUserId: null
        },
        data: {
          assignedUserId: user.id,
          claimedAt: now,
          claimExpiresAt
        }
      });

      if (updated.count !== 1) return null;

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.SCHEDULE_CLAIMED,
        entityType: "ScheduleOccurrence",
        entityId: id,
        metadata: {
          scheduleName: candidate.scheduleNameSnapshot,
          scheduledStartAt: candidate.scheduledStartAt.toISOString(),
          claimExpiryMinutes: organization.claimExpiryMinutes,
          claimExpiresAt: claimExpiresAt.toISOString()
        }
      }, tx);

      return tx.scheduleOccurrence.findUnique({
        where: { id },
        include: occurrenceInclude
      });
    });

    if (!claimed) {
      throw new MobileApiError(409, "ALREADY_CLAIMED", "Another user claimed this Schedule first.");
    }

    return Response.json({ occurrence: occurrenceDto(claimed) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return mobileErrorResponse(new MobileApiError(409, "ACTIVE_WORK_EXISTS", "You already have active work or another user claimed this Schedule first."));
    }
    return mobileErrorResponse(error);
  }
}
