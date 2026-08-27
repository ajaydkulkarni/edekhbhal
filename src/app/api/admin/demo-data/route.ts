import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isDemoDataEnabled } from "@/lib/demoDataAccess";
import { populateDemoData } from "@/lib/demoSeed";

const schema = z.object({
  confirm: z.literal("POPULATE")
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!isDemoDataEnabled()) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const user = await requireUser();
    const adminMembership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, status: "ACTIVE", role: "ADMIN" }
    });
    if (!adminMembership) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    const origin = req.headers.get("origin");
    if (origin && appUrl && origin !== appUrl) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    schema.parse(await req.json());

    const result = await populateDemoData({
      actorUserId: user.id,
      actorOrganizationId: adminMembership.organizationId,
      generateOccurrences: true
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : "Unable to populate demo data."
    }, { status: 400 });
  }
}
