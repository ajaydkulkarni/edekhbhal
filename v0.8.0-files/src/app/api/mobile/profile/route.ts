import { ActionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireMobileUser, mobileErrorResponse } from "@/lib/mobileAuth";
import { normalizeSupportedLanguage, SUPPORTED_LANGUAGE_CODES } from "@/lib/translation";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  preferredLanguage: z.string().trim().max(10).nullable().optional()
});

function profileDto(user: {
  id: string;
  email: string;
  name: string | null;
  preferredLanguage: string | null;
  passwordHash: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    preferredLanguage: user.preferredLanguage,
    passwordSet: Boolean(user.passwordHash)
  };
}

export async function GET(req: Request) {
  try {
    const { user } = await requireMobileUser(req);
    return Response.json({ profile: profileDto(user) });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { user } = await requireMobileUser(req);
    const input = patchSchema.parse(await req.json());

    let preferredLanguage = user.preferredLanguage;
    if (input.preferredLanguage !== undefined) {
      if (input.preferredLanguage === null || input.preferredLanguage === "") {
        preferredLanguage = null;
      } else {
        const normalized = normalizeSupportedLanguage(input.preferredLanguage);
        if (!(SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(input.preferredLanguage.toLowerCase()) || normalized !== input.preferredLanguage.toLowerCase()) {
          return Response.json({ error: "Unsupported preferred language.", code: "UNSUPPORTED_LANGUAGE" }, { status: 400 });
        }
        preferredLanguage = normalized;
      }
    }

    const oldValue = {
      name: user.name,
      preferredLanguage: user.preferredLanguage
    };

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.preferredLanguage !== undefined ? { preferredLanguage } : {})
        }
      });
      await audit({
        userId: user.id,
        action: ActionType.PROFILE_UPDATED,
        entityType: "User",
        entityId: user.id,
        oldValue,
        newValue: {
          name: saved.name,
          preferredLanguage: saved.preferredLanguage
        },
        metadata: { client: "mobile" }
      }, tx);
      return saved;
    });

    return Response.json({ profile: profileDto(updated) });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
