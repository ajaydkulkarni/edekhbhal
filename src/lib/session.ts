import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { sha256 } from "./security";

export async function getSessionUser() {
  const token = (await cookies()).get("edk_session")?.value;
  if (!token) return null;
  const session = await prisma.session.findFirst({ where: { tokenHash: sha256(token), expiresAt: { gt: new Date() } }, include: { user: true } });
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user || !user.active) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireMembership(organizationId: string) {
  const user = await requireUser();
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } });
  if (!membership || membership.status !== "ACTIVE") throw new Error("FORBIDDEN");
  return { user, membership };
}
