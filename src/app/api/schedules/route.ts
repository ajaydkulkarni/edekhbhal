import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { buildOffsets, durationToMinutes, zonedLocalToUtc } from "@/lib/schedule";

const scheduleTaskSchema = z.object({
  taskId: z.string().min(1),
  sequence: z.number().int().positive(),
  duration: z.string().regex(/^\d{2}:[0-5]\d$/),
  evidenceRule: z.enum(["NONE", "PHOTO", "VIDEO", "RANDOM"]),
  randomEveryN: z.number().int().min(2).max(1000).nullable().optional(),
  randomEvidenceType: z.enum(["PHOTO", "VIDEO", "EITHER"]).nullable().optional()
});

const schema = z.object({
  name: z.string().trim().min(2).max(500),
  frequencyType: z.enum(["ONE_TIME", "RECURRING"]),
  recurrenceUnit: z.enum(["MINUTE", "HOUR", "DAY", "WEEK", "MONTH", "YEAR"]).nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(100000).nullable().optional(),
  recurrenceConfig: z.object({
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    monthDays: z.array(z.number().int().min(1).max(31)).optional()
  }).nullable().optional(),
  startLocal: z.string(),
  timezone: z.string().min(1).max(100),
  workAreaId: z.string().min(1),
  tasks: z.array(scheduleTaskSchema).min(1)
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
    if (!membership || !["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Only an Admin or Property Manager can create Schedules." }, { status: 403 });
    }

    const input = schema.parse(await req.json());
    if (input.frequencyType === "RECURRING" && (!input.recurrenceUnit || !input.recurrenceInterval)) {
      return NextResponse.json({ error: "Recurring Schedules require a recurrence interval and unit." }, { status: 400 });
    }

    const workArea = await prisma.workArea.findUnique({ where: { id: input.workAreaId }, include: { property: true } });
    if (!workArea || workArea.property.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Work Area not found in this Organization." }, { status: 404 });
    }
    if (workArea.status !== "ACTIVE" || workArea.property.status !== "ACTIVE") {
      return NextResponse.json({ error: "Schedules can only be created for active Work Areas under active Properties." }, { status: 409 });
    }

    const uniqueTaskIds = [...new Set(input.tasks.map((x) => x.taskId))];
    const validTasks = await prisma.task.findMany({ where: { id: { in: uniqueTaskIds }, organizationId: membership.organizationId, status: "ACTIVE" } });
    if (validTasks.length !== uniqueTaskIds.length) {
      return NextResponse.json({ error: "Every selected Task must be active and belong to this Organization." }, { status: 409 });
    }

    const durations = input.tasks.map((x) => durationToMinutes(x.duration));
    const offsets = buildOffsets(durations);
    const startAt = zonedLocalToUtc(input.startLocal, input.timezone);

    const schedule = await prisma.$transaction(async (tx) => {
      const created = await tx.schedule.create({
        data: {
          organizationId: membership.organizationId,
          name: input.name,
          frequencyType: input.frequencyType,
          recurrenceUnit: input.frequencyType === "RECURRING" ? input.recurrenceUnit : null,
          recurrenceInterval: input.frequencyType === "RECURRING" ? input.recurrenceInterval : null,
          recurrenceConfig: input.frequencyType === "RECURRING" && input.recurrenceConfig ? input.recurrenceConfig : Prisma.JsonNull,
          startAt,
          timezone: input.timezone,
          workAreaId: input.workAreaId,
          createdById: user.id
        }
      });

      for (let i = 0; i < input.tasks.length; i += 1) {
        const item = input.tasks[i];
        await tx.scheduleTask.create({
          data: {
            scheduleId: created.id,
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

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: "SCHEDULE_CREATED",
        entityType: "Schedule",
        entityId: created.id,
        newValue: {
          name: created.name,
          frequencyType: created.frequencyType,
          recurrenceUnit: created.recurrenceUnit,
          recurrenceInterval: created.recurrenceInterval,
          recurrenceConfig: input.recurrenceConfig ?? null,
          startAt: created.startAt.toISOString(),
          timezone: created.timezone,
          workAreaId: created.workAreaId,
          status: created.status,
          tasks: input.tasks.map((x, i) => ({ ...x, durationMinutes: offsets[i].durationMinutes }))
        }
      }, tx);
      return created;
    });

    return NextResponse.json({ schedule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to create Schedule." }, { status: 400 });
  }
}
