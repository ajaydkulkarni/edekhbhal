import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

const schema = z.object({
  logoUrl: z.string().max(1500000).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  addressLine3: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().min(1),
});

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      include: { organization: true },
    });
    if (!membership || membership.role !== "ADMIN") return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const data = schema.parse(await req.json());
    const old = membership.organization;
    const updated = await prisma.$transaction(async tx => {
      const organization = await tx.organization.update({ where: { id: membership.organizationId }, data });
      await audit({ organizationId: membership.organizationId, userId: user.id, action: "ORGANIZATION_UPDATED", entityType: "Organization", entityId: membership.organizationId, oldValue: old as any, newValue: organization as any }, tx);
      return organization;
    });
    return NextResponse.json({ organization: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update organization" }, { status: 400 });
  }
}
