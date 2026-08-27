import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  contentBase64: z.string().min(1).max(3_000_000)
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { user, membership } = await requireMembership(task.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    const input = schema.parse(await req.json());
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.length !== input.sizeBytes || bytes.length > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Attachment size validation failed" }, { status: 400 });
    }

    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.taskAttachment.create({
        data: {
          taskId: id,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: bytes.length,
          contentBase64: input.contentBase64,
          addedById: user.id
        }
      });
      await audit({
        organizationId: task.organizationId,
        userId: user.id,
        action: "TASK_ATTACHMENT_ADDED",
        entityType: "TaskAttachment",
        entityId: created.id,
        newValue: { taskId: id, fileName: created.fileName, mimeType: created.mimeType, sizeBytes: created.sizeBytes }
      }, tx);
      return created;
    });

    return NextResponse.json({
      attachment: { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to add attachment" }, { status: 400 });
  }
}
