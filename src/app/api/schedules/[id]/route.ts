import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";
import { buildOffsets, durationToMinutes, zonedLocalToUtc } from "@/lib/schedule";
import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";

const taskSchema = z.object({
  taskId: z.string().min(1),
  sequence: z.number().int().positive(),
  duration: z.string().regex(/^\d{2}:[0-5]\d$/),
  evidenceRule: z.enum(["NONE", "PHOTO", "VIDEO", "RANDOM"]),
  randomEveryN: z.number().int().min(2).max(1000).nullable().optional(),
  randomEvidenceType: z.enum(["PHOTO", "VIDEO", "EITHER"]).nullable().optional()
});

const fullSchema = z.object({
  name: z.string().trim().min(2).max(500),
  documentReference: z.string().trim().max(150).nullable().optional(),
  documentRevision: z.string().trim().max(100).nullable().optional(),
  frequencyType: z.enum(["ONE_TIME", "RECURRING"]),
  recurrenceUnit: z.enum(["MINUTE", "HOUR", "DAY", "WEEK", "MONTH", "YEAR"]).nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(100000).nullable().optional(),
  recurrenceConfig: z.object({
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    monthDays: z.array(z.number().int().min(1).max(31)).optional()
  }).nullable().optional(),
  startLocal: z.string(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  timezone: z.string().min(1).max(100),
  workAreaId: z.string().min(1),
  tasks: z.array(taskSchema).min(1)
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

function snapshot(schedule: any) {
  return {
    name: schedule.name,
    documentReference: schedule.documentReference,
    documentRevision: schedule.documentRevision,
    frequencyType: schedule.frequencyType,
    recurrenceUnit: schedule.recurrenceUnit,
    recurrenceInterval: schedule.recurrenceInterval,
    recurrenceConfig: schedule.recurrenceConfig,
    startAt: schedule.startAt instanceof Date ? schedule.startAt.toISOString() : schedule.startAt,
    endDate: schedule.endDate instanceof Date ? schedule.endDate.toISOString().slice(0,10) : schedule.endDate,
    timezone: schedule.timezone,
    workAreaId: schedule.workAreaId,
    status: schedule.status,
    tasks: (schedule.scheduleTasks ?? []).map((x: any) => ({
      taskId: x.taskId,
      sequence: x.sequence,
      durationMinutes: x.durationMinutes,
      plannedStartOffsetMinutes: x.plannedStartOffsetMinutes,
      plannedEndOffsetMinutes: x.plannedEndOffsetMinutes,
      evidenceRule: x.evidenceRule,
      randomEveryN: x.randomEveryN,
      randomEvidenceType: x.randomEvidenceType
    }))
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const old = await prisma.schedule.findUnique({
      where: { id },
      include: { scheduleTasks: { orderBy: { sequence: "asc" } } }
    });
    if (!old) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });

    const { user, membership } = await requireMembership(old.organizationId);
    if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Only an Admin or Property Manager can edit Schedules." }, { status: 403 });
    }

    const raw = await req.json();
    const statusOnly = Object.keys(raw).length === 1 && raw.status;
    if (statusOnly) {
      const { status } = statusSchema.parse(raw);
      const updated = await prisma.$transaction(async (tx) => {
        const s = await tx.schedule.update({ where: { id }, data: { status } });
        await audit({
          organizationId: old.organizationId,
          userId: user.id,
          action: old.status === "ACTIVE" && status === "INACTIVE" ? "SCHEDULE_INACTIVATED" : old.status === "INACTIVE" && status === "ACTIVE" ? "SCHEDULE_REACTIVATED" : "SCHEDULE_UPDATED",
          entityType: "Schedule",
          entityId: id,
          oldValue: snapshot(old),
          newValue: { ...snapshot(old), status }
        }, tx);
        return s;
      });
      if (status === "INACTIVE") await prisma.scheduleOccurrence.updateMany({ where: { scheduleId: id, status: "PENDING", scheduledStartAt: { gt: new Date() } }, data: { status: "CANCELED" } });
      if (status === "ACTIVE") {
        await prisma.scheduleOccurrence.deleteMany({ where: { scheduleId: id, status: "CANCELED", scheduledStartAt: { gt: new Date() } } });
        await reconcileScheduleOccurrences(id, { userId: user.id, reason: "edit" });
      }
      return NextResponse.json({ schedule: updated });
    }

    const input = fullSchema.parse(raw);
    if (input.frequencyType === "RECURRING" && (!input.recurrenceUnit || !input.recurrenceInterval)) {
      return NextResponse.json({ error: "Recurring Schedules require a recurrence interval and unit." }, { status: 400 });
    }

    const workArea = await prisma.workArea.findUnique({ where: { id: input.workAreaId }, include: { property: true } });
    if (!workArea || workArea.property.organizationId !== old.organizationId) {
      return NextResponse.json({ error: "Work Area not found in this Organization." }, { status: 404 });
    }
    if ((workArea.status !== "ACTIVE" || workArea.property.status !== "ACTIVE") && workArea.id !== old.workAreaId) {
      return NextResponse.json({ error: "A newly selected Work Area must be active and under an active Property." }, { status: 409 });
    }

    const oldTaskIds = new Set(old.scheduleTasks.map((x) => x.taskId));
    const requestedIds = [...new Set(input.tasks.map((x) => x.taskId))];
    const taskRecords = await prisma.task.findMany({ where: { id: { in: requestedIds }, organizationId: old.organizationId } });
    if (taskRecords.length !== requestedIds.length) return NextResponse.json({ error: "One or more Tasks do not belong to this Organization." }, { status: 409 });
    const invalidNew = taskRecords.find((task) => task.status !== "ACTIVE" && !oldTaskIds.has(task.id));
    if (invalidNew) return NextResponse.json({ error: "Inactive Tasks cannot be newly added to a Schedule." }, { status: 409 });

    const durations = input.tasks.map((x) => durationToMinutes(x.duration));
    const offsets = buildOffsets(durations);
    const startAt = zonedLocalToUtc(input.startLocal, input.timezone);
    const endDate = input.frequencyType === "RECURRING" && input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;
    if (endDate && input.endDate! < input.startLocal.slice(0,10)) return NextResponse.json({ error: "Schedule End Date cannot be before the Start Date." }, { status: 400 });

    const updated = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.update({
        where: { id },
        data: {
          name: input.name,
          documentReference: input.documentReference || null,
          documentRevision: input.documentRevision || null,
          frequencyType: input.frequencyType,
          recurrenceUnit: input.frequencyType === "RECURRING" ? input.recurrenceUnit : null,
          recurrenceInterval: input.frequencyType === "RECURRING" ? input.recurrenceInterval : null,
          recurrenceConfig: input.frequencyType === "RECURRING" && input.recurrenceConfig ? input.recurrenceConfig : Prisma.JsonNull,
          startAt,
          endDate,
          occurrenceGeneratedThrough: null,
          timezone: input.timezone,
          workAreaId: input.workAreaId
        }
      });

      await tx.scheduleTask.deleteMany({ where: { scheduleId: id } });
      for (let i = 0; i < input.tasks.length; i += 1) {
        const item = input.tasks[i];
        await tx.scheduleTask.create({
          data: {
            scheduleId: id,
            taskId: item.taskId,
            sequence: i + 1,
            durationMinutes: offsets[i].durationMinutes,
            plannedStartOffsetMinutes: offsets[i].plannedStartOffsetMinutes,
            plannedEndOffsetMinutes: offsets[i].plannedEndOffsetMinutes,
            evidenceRule: item.evidenceRule,
            randomEveryN: item.evidenceRule === "RANDOM" ? item.randomEveryN : null,
            randomEvidenceType: item.evidenceRule === "RANDOM" ? item.randomEvidenceType : null
          }
        });
      }

      const fresh = await tx.schedule.findUnique({ where: { id }, include: { scheduleTasks: { orderBy: { sequence: "asc" } } } });
      await audit({
        organizationId: old.organizationId,
        userId: user.id,
        action: "SCHEDULE_UPDATED",
        entityType: "Schedule",
        entityId: id,
        oldValue: snapshot(old),
        newValue: snapshot(fresh)
      }, tx);
      return schedule;
    });

    await prisma.scheduleOccurrence.deleteMany({ where: { scheduleId: id, status: "PENDING", scheduledStartAt: { gt: new Date() } } });
    await reconcileScheduleOccurrences(id, { userId: user.id, reason: "edit" });
    return NextResponse.json({ schedule: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update Schedule." }, { status: 400 });
  }
}
