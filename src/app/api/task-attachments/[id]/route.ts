import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attachment = await prisma.taskAttachment.findUnique({ where: { id }, include: { task: true } });
    if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

    const { user, membership } = await requireMembership(attachment.task.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskAttachment.delete({ where: { id } });
      await audit({
        organizationId: attachment.task.organizationId,
        userId: user.id,
        action: "TASK_ATTACHMENT_REMOVED",
        entityType: "TaskAttachment",
        entityId: id,
        oldValue: { taskId: attachment.taskId, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }
      }, tx);
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to remove attachment" }, { status: 400 });
  }
}
