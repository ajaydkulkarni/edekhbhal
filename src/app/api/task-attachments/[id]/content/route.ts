import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id },
      include: { task: true }
    });
    if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    await requireMembership(attachment.task.organizationId);

    const bytes = Buffer.from(attachment.contentBase64, "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to read attachment" }, { status: 403 });
  }
}
