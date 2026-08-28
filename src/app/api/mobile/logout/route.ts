import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireMobileUser, mobileErrorResponse } from "@/lib/mobileAuth";

export async function POST(req: Request) {
  try {
    const { user, session } = await requireMobileUser(req);
    const organizationId = req.headers.get("x-organization-id")?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.session.delete({ where: { id: session.id } });
      await audit({
        userId: user.id,
        action: "LOGOUT",
        metadata: { client: "mobile" }
      }, tx);
    });

    // Presence is operational telemetry. Keep logout successful even if the
    // presence migration has not yet been applied or this best-effort update fails.
    try {
      const now = new Date();
      if (organizationId) {
        await prisma.$executeRaw`
          UPDATE user_presence
          SET is_active = FALSE, last_seen_at = ${now}, updated_at = ${now}
          WHERE organization_id = ${organizationId} AND user_id = ${user.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE user_presence
          SET is_active = FALSE, last_seen_at = ${now}, updated_at = ${now}
          WHERE user_id = ${user.id}
        `;
      }
    } catch {
      // Presence must never block sign-out.
    }

    return Response.json({ ok: true });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
