import { MembershipRole } from "@prisma/client";
import { prisma } from "./prisma";

export type MembershipScope = {
  id: string;
  organizationId: string;
  role: MembershipRole;
};

export async function assignedPropertyIds(membership: MembershipScope) {
  if (membership.role === "ADMIN") return null;
  const rows = await prisma.organizationMemberProperty.findMany({
    where: { organizationMemberId: membership.id },
    select: { propertyId: true }
  });
  return rows.map((row) => row.propertyId);
}

export async function canAccessProperty(
  membership: MembershipScope,
  propertyId: string
) {
  if (membership.role === "ADMIN") return true;
  return Boolean(await prisma.organizationMemberProperty.findUnique({
    where: {
      organizationMemberId_propertyId: {
        organizationMemberId: membership.id,
        propertyId
      }
    },
    select: { id: true }
  }));
}
