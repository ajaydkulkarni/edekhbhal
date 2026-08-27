import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/security";

const schema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim())
});

function stagingDevelopmentAuthEnabled() {
  const appUrl = process.env.APP_URL ?? "";
  return appUrl.includes("edekhbhal-staging.vercel.app") ||
    (process.env.MOBILE_DEV_AUTH_ENABLED ?? "").toLowerCase() === "true";
}

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {},
      create: { email: input.email }
    });

    const raw = randomToken(32);
    await prisma.magicLinkToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    await audit({
      userId: user.id,
      action: "MAGIC_LINK_REQUESTED",
      metadata: {
        email: user.email,
        client: "mobile"
      }
    });

    const response: Record<string, unknown> = {
      message: "Check your email for the eDekhbhal sign-in link."
    };

    if (stagingDevelopmentAuthEnabled()) {
      response.devToken = raw;
      response.devDeepLink = `edekhbhal://auth?token=${encodeURIComponent(raw)}`;
      response.message = "Staging email delivery is not connected. Use Development Sign In.";
    }

    return Response.json(response);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to create mobile sign-in link." },
      { status: 400 }
    );
  }
}
