import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  locationIdentifier: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const old = await prisma.workArea.findUnique({ where: { id }, include: { property: true } });
    if (!old) return NextResponse.json({ error: "Work Area not found" }, { status: 404 });
    const { user, membership } = await requireMembership(old.property.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const data = schema.parse(await req.json());
    const updated = await prisma.$transaction(async tx => {
      const workArea = await tx.workArea.update({ where: { id }, data });
      const action = data.status === "INACTIVE" && old.status !== "INACTIVE" ? "WORK_AREA_DELETED" : data.status === "ACTIVE" && old.status !== "ACTIVE" ? "WORK_AREA_REACTIVATED" : "WORK_AREA_UPDATED";
      await audit({ organizationId: old.property.organizationId, userId: user.id, action, entityType: "WorkArea", entityId: id, oldValue: old as any, newValue: workArea as any }, tx);
      return workArea;
    });
    return NextResponse.json({ workArea: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update Work Area" }, { status: 400 });
  }
}
