import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireMobileUser, mobileErrorResponse } from "@/lib/mobileAuth";

export async function POST(req: Request) {
  try {
    const { user, session } = await requireMobileUser(req);
    await prisma.$transaction(async (tx) => {
      await tx.session.delete({ where: { id: session.id } });
      await audit({
        userId: user.id,
        action: "LOGOUT",
        metadata: { client: "mobile" }
      }, tx);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
