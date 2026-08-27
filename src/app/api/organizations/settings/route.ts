import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { normalizeWorkingHours } from "@/lib/workingHours";
import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";

const schema = z.object({
  logoUrl: z.string().max(1500000).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  addressLine3: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().min(1).optional(),
  claimExpiryMinutes: z.number().int().min(1).max(1440).optional(),
  workingHours: z.any().nullable().optional(),
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
    if (Object.prototype.hasOwnProperty.call(data, "workingHours")) {
      const normalizedWorkingHours = normalizeWorkingHours(data.workingHours);
      data.workingHours = (normalizedWorkingHours === null ? Prisma.DbNull : normalizedWorkingHours) as any;
    }
    const old = membership.organization;
    const updated = await prisma.$transaction(async tx => {
      const organization = await tx.organization.update({ where: { id: membership.organizationId }, data });
      await audit({ organizationId: membership.organizationId, userId: user.id, action: "ORGANIZATION_UPDATED", entityType: "Organization", entityId: membership.organizationId, oldValue: old as any, newValue: organization as any }, tx);
      return organization;
    });
    if (Object.prototype.hasOwnProperty.call(data, "workingHours")) {
      const schedules = await prisma.schedule.findMany({ where: { organizationId: membership.organizationId, status: "ACTIVE" }, select: { id: true } });
      for (const schedule of schedules) await reconcileScheduleOccurrences(schedule.id, { userId: user.id, reason: "edit" });
    }
    return NextResponse.json({ organization: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update organization" }, { status: 400 });
  }
}
