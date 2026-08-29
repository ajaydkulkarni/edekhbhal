import { prisma } from "@/lib/prisma";
import {
  requireMobileMembership,
  mobileErrorResponse
} from "@/lib/mobileAuth";
import {
  activeOccurrenceForUser,
  occurrenceDto,
  occurrenceInclude,
  releaseExpiredClaims
} from "@/lib/mobileExecution";
import { supersedeDueOccurrences } from "@/lib/occurrenceSupersession";

export async function GET(req: Request) {
  try {
    const { user, membership, organization } = await requireMobileMembership(req);

    await releaseExpiredClaims(membership.organizationId);

    // Reconcile stale recurring work before choosing the next mobile item.
    // This makes the queue correct even between scheduled cron runs.
    await supersedeDueOccurrences({
      organizationId: membership.organizationId
    });

    const active = await activeOccurrenceForUser(
      membership.organizationId,
      user.id
    );

    if (active) {
      return Response.json({
        state: active.status === "IN_PROGRESS" ? "IN_PROGRESS" : "CLAIMED",
        occurrence: occurrenceDto(active),
        claimExpiryMinutes: organization.claimExpiryMinutes
      });
    }

    const candidate = await prisma.scheduleOccurrence.findFirst({
      where: {
        organizationId: membership.organizationId,
        status: "PENDING",
        assignedUserId: null,
        schedule: { status: "ACTIVE" },
        workArea: {
          status: "ACTIVE",
          property: { status: "ACTIVE" }
        }
      },
      include: occurrenceInclude,
      orderBy: { scheduledStartAt: "asc" }
    });

    return Response.json({
      state: candidate ? "AVAILABLE" : "EMPTY",
      occurrence: candidate ? occurrenceDto(candidate) : null,
      claimExpiryMinutes: organization.claimExpiryMinutes
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
