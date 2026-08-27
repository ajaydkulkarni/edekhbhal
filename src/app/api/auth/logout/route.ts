import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/security";
import { audit } from "@/lib/audit";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("edk_session")?.value;

  if (token) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) }
    });

    if (session) {
      await prisma.$transaction(async (tx) => {
        await tx.session.delete({ where: { id: session.id } });
        await audit({
          userId: session.userId,
          action: "LOGOUT",
          metadata: { client: "web" }
        }, tx);
      });
    }
  }

  cookieStore.set("edk_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  return NextResponse.json({ ok: true });
}
