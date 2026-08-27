import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";
import { sanitizeRichText } from "@/lib/richText";
import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";

const schema = z.object({
  name: z.string().trim().min(2).max(500).optional(),
  descriptionHtml: z.string().max(100000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const old = await prisma.task.findUnique({ where: { id } });
    if (!old) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { user, membership } = await requireMembership(old.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const input = schema.parse(await req.json());
    const data = {
      ...input,
      ...(input.descriptionHtml !== undefined ? { descriptionHtml: sanitizeRichText(input.descriptionHtml) } : {})
    };

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({ where: { id }, data });
      const action =
        old.status === "ACTIVE" && task.status === "INACTIVE" ? "TASK_INACTIVATED" :
        old.status === "INACTIVE" && task.status === "ACTIVE" ? "TASK_REACTIVATED" :
        "TASK_UPDATED";
      await audit({
        organizationId: old.organizationId,
        userId: user.id,
        action,
        entityType: "Task",
        entityId: id,
        oldValue: { name: old.name, descriptionHtml: old.descriptionHtml, status: old.status },
        newValue: { name: task.name, descriptionHtml: task.descriptionHtml, status: task.status }
      }, tx);
      return task;
    });
    const scheduleLinks = await prisma.scheduleTask.findMany({ where: { taskId: id, schedule: { status: "ACTIVE" } }, select: { scheduleId: true } });
    for (const link of scheduleLinks) await reconcileScheduleOccurrences(link.scheduleId, { userId: user.id, reason: "edit" });
    return NextResponse.json({ task: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update task" }, { status: 400 });
  }
}
