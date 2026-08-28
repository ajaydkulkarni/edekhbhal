import { Prisma, ScheduleOccurrenceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMobileMembership, mobileErrorResponse } from "@/lib/mobileAuth";
import { zonedLocalToUtc } from "@/lib/schedule";
import { normalizeSupportedLanguage, translateCached } from "@/lib/translation";

function localDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDateKey(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function effectiveSeconds(input: {
  actualDurationSeconds: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  if (input.actualDurationSeconds != null) return input.actualDurationSeconds;
  if (input.startedAt && input.completedAt) {
    return Math.max(0, Math.floor((input.completedAt.getTime() - input.startedAt.getTime()) / 1000));
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { user, membership } = await requireMobileMembership(req);
    const url = new URL(req.url);
    const timeZone = membership.organization.timezone;
    const today = localDateKey(new Date(), timeZone);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
    const fromKey = validDateKey(url.searchParams.get("from"))
      ? url.searchParams.get("from") as string
      : addDays(today, -(days - 1));
    const toKey = validDateKey(url.searchParams.get("to"))
      ? url.searchParams.get("to") as string
      : today;
    const startAt = zonedLocalToUtc(`${fromKey}T00:00`, timeZone);
    const endAt = zonedLocalToUtc(`${addDays(toKey, 1)}T00:00`, timeZone);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(25, Math.max(5, Number(url.searchParams.get("pageSize") ?? 10)));

    const where: Prisma.ScheduleOccurrenceWhereInput = {
      organizationId: membership.organizationId,
      assignedUserId: user.id,
      scheduledStartAt: { gte: startAt, lt: endAt },
      status: {
        in: [
          ScheduleOccurrenceStatus.COMPLETED,
          ScheduleOccurrenceStatus.PARTIALLY_COMPLETED,
          ScheduleOccurrenceStatus.MISSED
        ]
      },
      ...(q ? {
        OR: [
          { scheduleNameSnapshot: { contains: q, mode: "insensitive" } },
          { propertyNameSnapshot: { contains: q, mode: "insensitive" } },
          { workAreaNameSnapshot: { contains: q, mode: "insensitive" } },
          { tasks: { some: { taskNameSnapshot: { contains: q, mode: "insensitive" } } } }
        ]
      } : {})
    };

    const [total, occurrences] = await Promise.all([
      prisma.scheduleOccurrence.count({ where }),
      prisma.scheduleOccurrence.findMany({
        where,
        include: {
          notes: { where: { scope: "SCHEDULE" }, orderBy: { createdAt: "asc" } },
          tasks: {
            orderBy: { sequence: "asc" },
            include: {
              evidence: { select: { id: true } },
              notes: { orderBy: { createdAt: "asc" } }
            }
          }
        },
        orderBy: [{ completedAt: "desc" }, { scheduledStartAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    const language = normalizeSupportedLanguage(user.preferredLanguage ?? "en");
    const mapped = await Promise.all(occurrences.map(async (occurrence) => {
      const scheduleName = await translateCached({
        organizationId: membership.organizationId,
        sourceType: "OCCURRENCE",
        sourceId: occurrence.id,
        fieldName: "scheduleName",
        language,
        text: occurrence.scheduleNameSnapshot
      });

      const tasks = await Promise.all(occurrence.tasks.map(async (task) => {
        const translatedName = await translateCached({
          organizationId: membership.organizationId,
          sourceType: "OCCURRENCE_TASK",
          sourceId: task.id,
          fieldName: "taskName",
          language,
          text: task.taskNameSnapshot
        });
        return {
          id: task.id,
          sequence: task.sequence,
          name: translatedName.text,
          sourceName: task.taskNameSnapshot,
          plannedDurationMinutes: task.plannedDurationMinutes,
          actualDurationSeconds: task.actualDurationSeconds,
          status: task.status,
          evidenceCount: task.evidence.length,
          notes: task.notes.map((note) => ({
            id: note.id,
            note: note.note,
            createdAt: note.createdAt.toISOString()
          }))
        };
      }));

      const actualDurationSeconds = effectiveSeconds(occurrence);
      return {
        id: occurrence.id,
        status: occurrence.status,
        scheduleName: scheduleName.text,
        sourceScheduleName: occurrence.scheduleNameSnapshot,
        workAreaName: occurrence.workAreaNameSnapshot,
        propertyName: occurrence.propertyNameSnapshot,
        scheduledStartAt: occurrence.scheduledStartAt.toISOString(),
        startedAt: occurrence.startedAt?.toISOString() ?? null,
        completedAt: occurrence.completedAt?.toISOString() ?? null,
        plannedDurationMinutes: occurrence.plannedDurationMinutes,
        actualDurationSeconds,
        deviationSeconds: actualDurationSeconds == null
          ? null
          : actualDurationSeconds - occurrence.plannedDurationMinutes * 60,
        notes: occurrence.notes.map((note) => ({
          id: note.id,
          note: note.note,
          createdAt: note.createdAt.toISOString()
        })),
        tasks
      };
    }));

    return Response.json({
      from: fromKey,
      to: toKey,
      q,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      language,
      occurrences: mapped
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
