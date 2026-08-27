import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { sanitizeRichText } from "@/lib/richText";

const schema = z.object({
  name: z.string().trim().min(2).max(500),
  descriptionHtml: z.string().max(100000)
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
    if (!membership || !["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    const input = schema.parse(await req.json());
    const data = { ...input, descriptionHtml: sanitizeRichText(input.descriptionHtml) };

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organizationId: membership.organizationId,
          createdById: user.id,
          name: data.name,
          descriptionHtml: data.descriptionHtml
        }
      });
      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: "TASK_CREATED",
        entityType: "Task",
        entityId: created.id,
        newValue: { name: created.name, descriptionHtml: created.descriptionHtml, status: created.status }
      }, tx);
      return created;
    });
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to create task" }, { status: 400 });
  }
}
