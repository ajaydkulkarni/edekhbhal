import { MembershipRole } from "@prisma/client";
import { prisma } from "./prisma";
import { sha256 } from "./security";

export class MobileApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function mobileErrorResponse(error: unknown) {
  if (error instanceof MobileApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected mobile API error." },
    { status: 400 }
  );
}

export async function getMobileSession(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: {
      tokenHash: sha256(token),
      expiresAt: { gt: new Date() },
      user: { active: true }
    },
    include: { user: true }
  });

  if (!session) return null;
  return { token, session, user: session.user };
}

export async function requireMobileUser(req: Request) {
  const found = await getMobileSession(req);
  if (!found) throw new MobileApiError(401, "UNAUTHENTICATED", "Please sign in again.");
  return found;
}

export async function requireMobileMembership(
  req: Request,
  allowedRoles: MembershipRole[] = [MembershipRole.USER]
) {
  const { user, session, token } = await requireMobileUser(req);
  const requestedOrganizationId = req.headers.get("x-organization-id")?.trim();

  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId: user.id,
      status: "ACTIVE",
      ...(requestedOrganizationId ? { organizationId: requestedOrganizationId } : {})
    },
    include: { organization: true },
    orderBy: { createdAt: "asc" }
  });

  const membership = memberships.find((item) => allowedRoles.includes(item.role));
  if (!membership) {
    throw new MobileApiError(
      403,
      "MOBILE_ROLE_NOT_ALLOWED",
      "This mobile work queue is available to active USER-role members."
    );
  }

  return { user, membership, organization: membership.organization, session, token };
}

export function membershipDto(membership: {
  organizationId: string;
  role: MembershipRole;
  organization: { id: string; name: string; logoUrl: string | null; timezone: string };
}) {
  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationLogoUrl: membership.organization.logoUrl,
    timezone: membership.organization.timezone,
    role: membership.role
  };
}
