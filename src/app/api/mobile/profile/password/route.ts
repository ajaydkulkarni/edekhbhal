import { ActionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireMobileUser, mobileErrorResponse, MobileApiError } from "@/lib/mobileAuth";
import { hashPassword, verifyPassword } from "@/lib/password";

const schema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(128)
});

export async function POST(req: Request) {
  try {
    const { user, session } = await requireMobileUser(req);
    const input = schema.parse(await req.json());

    const existingHash = user.passwordHash;
    const recoverySession = session.authMethod === "MAGIC_LINK";
    if (existingHash && !recoverySession) {
      if (!input.currentPassword || !verifyPassword(input.currentPassword, existingHash)) {
        throw new MobileApiError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
      }
    }

    const passwordHash = hashPassword(input.newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.update({ where: { id: session.id }, data: { authMethod: "PASSWORD" } });
      await tx.session.deleteMany({
        where: { userId: user.id, id: { not: session.id } }
      });
      await audit({
        userId: user.id,
        action: ActionType.PROFILE_UPDATED,
        entityType: "User",
        entityId: user.id,
        metadata: {
          client: "mobile",
          passwordChanged: true,
          recoveryViaMagicLink: recoverySession
        }
      }, tx);
    });

    return Response.json({ ok: true, passwordSet: true });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
