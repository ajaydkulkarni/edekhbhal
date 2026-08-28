import { ActionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/security";
import { membershipDto } from "@/lib/mobileAuth";

const schema = z.object({
  token: z.string().min(20)
});

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const record = await prisma.magicLinkToken.findFirst({
      where: {
        tokenHash: sha256(input.token),
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: "ACTIVE" },
              include: { organization: true },
              orderBy: { createdAt: "asc" }
            }
          }
        }
      }
    });

    if (!record) {
      return Response.json(
        { error: "Invalid or expired authentication link.", code: "INVALID_TOKEN" },
        { status: 400 }
      );
    }

    const mobileMemberships = record.user.memberships.filter((membership) => membership.role === "USER");
    if (!mobileMemberships.length) {
      return Response.json(
        {
          error: "This mobile application is currently available to active USER-role members.",
          code: "MOBILE_ROLE_NOT_ALLOWED"
        },
        { status: 403 }
      );
    }

    const sessionToken = randomToken(32);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.magicLinkToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() }
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() }
      });
      await tx.session.create({
        data: {
          userId: record.userId,
          tokenHash: sha256(sessionToken),
          expiresAt,
          authMethod: "MAGIC_LINK"
        }
      });
      await audit({
        userId: record.userId,
        action: ActionType.LOGIN,
        metadata: {
          method: "mobile_magic_link",
          memberships: mobileMemberships.map((item) => item.organizationId)
        }
      }, tx);
      await audit({
        userId: record.userId,
        action: ActionType.MOBILE_SESSION_CREATED,
        metadata: {
          expiresAt: expiresAt.toISOString(),
          authMethod: "MAGIC_LINK"
        }
      }, tx);
    });

    return Response.json({
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: record.user.id,
        email: record.user.email,
        name: record.user.name,
        preferredLanguage: record.user.preferredLanguage,
        passwordSet: Boolean(record.user.passwordHash)
      },
      memberships: mobileMemberships.map(membershipDto),
      defaultOrganizationId: mobileMemberships[0].organizationId
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 400 }
    );
  }
}
