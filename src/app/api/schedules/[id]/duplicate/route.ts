import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const source = await prisma.schedule.findUnique({
      where: { id },
      include: { scheduleTasks: { orderBy: { sequence: "asc" } }, workArea: { include: { property: true } } }
    });
    if (!source) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });

    const { user, membership } = await requireMembership(source.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Only an Admin or Property Manager can duplicate Schedules." }, { status: 403 });
    }

    if (source.workArea.status !== "ACTIVE" || source.workArea.property.status !== "ACTIVE") {
      return NextResponse.json({ error: "The source Schedule's Work Area is inactive. Reactivate it before duplicating." }, { status: 409 });
    }

    const taskIds = [...new Set(source.scheduleTasks.map((x) => x.taskId))];
    const activeCount = await prisma.task.count({ where: { id: { in: taskIds }, organizationId: source.organizationId, status: "ACTIVE" } });
    if (activeCount !== taskIds.length) {
      return NextResponse.json({ error: "The source Schedule contains inactive Tasks. Reactivate them before duplicating." }, { status: 409 });
    }

    const copy = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          organizationId: source.organizationId,
          name: `${source.name} — Copy`,
          frequencyType: source.frequencyType,
          recurrenceUnit: source.recurrenceUnit,
          recurrenceInterval: source.recurrenceInterval,
          recurrenceConfig: source.recurrenceConfig ?? Prisma.JsonNull,
          startAt: source.startAt,
          timezone: source.timezone,
          workAreaId: source.workAreaId,
          createdById: user.id
        }
      });
      for (const item of source.scheduleTasks) {
        await tx.scheduleTask.create({
          data: {
            scheduleId: schedule.id,
            taskId: item.taskId,
            sequence: item.sequence,
            durationMinutes: item.durationMinutes,
            plannedStartOffsetMinutes: item.plannedStartOffsetMinutes,
            plannedEndOffsetMinutes: item.plannedEndOffsetMinutes,
            evidenceRule: item.evidenceRule,
            randomEveryN: item.randomEveryN,
            randomEvidenceType: item.randomEvidenceType
          }
        });
      }
      await audit({
        organizationId: source.organizationId,
        userId: user.id,
        action: "SCHEDULE_DUPLICATED",
        entityType: "Schedule",
        entityId: schedule.id,
        metadata: { sourceScheduleId: source.id, sourceScheduleName: source.name },
        newValue: { name: schedule.name, workAreaId: schedule.workAreaId, frequencyType: schedule.frequencyType }
      }, tx);
      return schedule;
    });

    return NextResponse.json({ schedule: copy });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to duplicate Schedule." }, { status: 400 });
  }
}
