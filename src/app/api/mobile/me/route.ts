import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileErrorResponse, membershipDto } from "@/lib/mobileAuth";

export async function GET(req: Request) {
  try {
    const { user } = await requireMobileUser(req);
    const memberships = await prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
        role: "USER"
      },
      include: { organization: true },
      orderBy: { createdAt: "asc" }
    });

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferredLanguage: user.preferredLanguage,
        passwordSet: Boolean(user.passwordHash)
      },
      memberships: memberships.map(membershipDto)
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
