import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { randomToken, sha256 } from "@/lib/security";

const bodySchema = z.object({ email: z.string().email() });
const STAGING_APP_URL = "https://edekhbhal-staging.vercel.app";

function enabled() {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  return process.env.E2E_TESTING_ENABLED === "true" && appUrl === STAGING_APP_URL;
}
function allowedEmails() {
  return [process.env.E2E_ADMIN_EMAIL, process.env.E2E_PM_EMAIL, process.env.E2E_USER_EMAIL, process.env.E2E_UNASSIGNED_EMAIL]
    .filter(Boolean).map(x => x!.toLowerCase());
}
export async function POST(req: Request) {
  if (!enabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const expected = process.env.E2E_TEST_SECRET;
  const supplied = req.headers.get("x-e2e-secret");
  if (!expected || supplied !== expected) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { email } = bodySchema.parse(await req.json());
  const normalized = email.toLowerCase();
  if (!allowedEmails().includes(normalized)) return NextResponse.json({ error: "E2E identity not allowed." }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.active) return NextResponse.json({ error: "E2E user not found." }, { status: 404 });

  const token = randomToken(32);
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      authMethod: "e2e"
    }
  });
  (await cookies()).set("edk_session", token, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 2 * 60 * 60
  });
  return NextResponse.json({ ok: true, token });
}
