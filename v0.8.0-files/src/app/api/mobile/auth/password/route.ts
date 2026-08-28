import { ActionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { membershipDto } from "@/lib/mobileAuth";
import { randomToken, sha256 } from "@/lib/security";
import { verifyPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128)
});

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const record = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { organization: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const valid = Boolean(record?.active && verifyPassword(input.password, record?.passwordHash));
    if (!valid || !record) {
      if (record) {
        await audit({
          userId: record.id,
          action: ActionType.LOGIN_FAILED,
          metadata: { method: "mobile_password", reason: "invalid_credentials" }
        });
      }
      return Response.json(
        { error: "Email or password is not recognized.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const mobileMemberships = record.memberships.filter((membership) => membership.role === "USER");
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
      await tx.session.create({
        data: {
          userId: record.id,
          tokenHash: sha256(sessionToken),
          expiresAt,
          authMethod: "PASSWORD"
        }
      });
      await audit({
        userId: record.id,
        action: ActionType.LOGIN,
        metadata: {
          method: "mobile_password",
          memberships: mobileMemberships.map((item) => item.organizationId)
        }
      }, tx);
      await audit({
        userId: record.id,
        action: ActionType.MOBILE_SESSION_CREATED,
        metadata: { expiresAt: expiresAt.toISOString(), authMethod: "PASSWORD" }
      }, tx);
    });

    return Response.json({
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: record.id,
        email: record.email,
        name: record.name,
        preferredLanguage: record.preferredLanguage,
        passwordSet: true
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
