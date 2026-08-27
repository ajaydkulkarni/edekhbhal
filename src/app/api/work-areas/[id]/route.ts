import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";
import { normalizeWorkingHours } from "@/lib/workingHours";
import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";

const schema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  locationIdentifier: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  workingHours: z.any().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const old = await prisma.workArea.findUnique({ where: { id }, include: { property: true } });
    if (!old) return NextResponse.json({ error: "Work Area not found" }, { status: 404 });
    const { user, membership } = await requireMembership(old.property.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const data = schema.parse(await req.json());
    if (Object.prototype.hasOwnProperty.call(data, "workingHours")) const normalizedWorkingHours = normalizeWorkingHours(data.workingHours); data.workingHours = (normalizedWorkingHours === null ? Prisma.DbNull : normalizedWorkingHours) as any;
    const updated = await prisma.$transaction(async tx => {
      const workArea = await tx.workArea.update({ where: { id }, data });
      const action = data.status === "INACTIVE" && old.status !== "INACTIVE" ? "WORK_AREA_DELETED" : data.status === "ACTIVE" && old.status !== "ACTIVE" ? "WORK_AREA_REACTIVATED" : "WORK_AREA_UPDATED";
      await audit({ organizationId: old.property.organizationId, userId: user.id, action, entityType: "WorkArea", entityId: id, oldValue: old as any, newValue: workArea as any }, tx);
      return workArea;
    });
    if (Object.prototype.hasOwnProperty.call(data, "workingHours") || data.status) {
      const schedules = await prisma.schedule.findMany({ where: { workAreaId: id, status: "ACTIVE" }, select: { id: true } });
      for (const schedule of schedules) await reconcileScheduleOccurrences(schedule.id, { userId: user.id, reason: "edit" });
    }
    return NextResponse.json({ workArea: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update Work Area" }, { status: 400 });
  }
}
