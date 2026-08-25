import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/security";

const schema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL is not configured in Vercel." },
        { status: 500 }
      );
    }

    const { email } = parsed.data;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    const raw = randomToken(32);

    await prisma.magicLinkToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await audit({
      userId: user.id,
      action: "MAGIC_LINK_REQUESTED",
      metadata: { email },
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const devLink = `${appUrl}/api/auth/verify?token=${raw}`;

    return NextResponse.json({
      message:
        "Authentication link created. Email delivery is not connected yet, so use the development link below.",
      devLink,
    });
  } catch (error) {
    console.error("request-link failed", error);

    const message =
      error instanceof Error && /connect|database|postgres|prisma/i.test(error.message)
        ? "The application could not connect to the staging database. Please verify DATABASE_URL in Vercel."
        : "Unable to create the authentication link. Check the Vercel runtime logs for details.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
