import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";
import {
  getOccurrenceForUser,
  occurrenceDto,
  releaseExpiredClaims
} from "@/lib/mobileExecution";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership } = await requireMobileMembership(req);
    await releaseExpiredClaims(membership.organizationId);

    const occurrence = await getOccurrenceForUser(id, membership.organizationId, user.id);
    if (!occurrence) throw new MobileApiError(404, "NOT_FOUND", "Schedule work not found.");

    return Response.json({ occurrence: occurrenceDto(occurrence) });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
