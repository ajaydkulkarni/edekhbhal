import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { effectiveWorkingHours, scheduleFitsWorkingHours } from "./workingHours";
import { zonedLocalToUtc } from "./schedule";

const HORIZON_HOURS = 48;

function localParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
}

function pseudoLocal(parts: {year:number;month:number;day:number;hour:number;minute:number}) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
}
function localString(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}T${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}
function dateKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function endDateKey(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : null;
}
function ceilDiv(a:number,b:number){ return Math.ceil(a/b); }

function candidates(schedule: any, fromUtc: Date, throughUtc: Date) {
  const zone = schedule.timezone;
  const startLocal = pseudoLocal(localParts(schedule.startAt, zone));
  const fromLocal = pseudoLocal(localParts(fromUtc, zone));
  const throughLocal = pseudoLocal(localParts(throughUtc, zone));
  const finalDate = endDateKey(schedule.endDate);
  const out: Date[] = [];
  const push = (d: Date) => {
    if (d < startLocal || d < fromLocal || d > throughLocal) return;
    if (finalDate && dateKey(d) > finalDate) return;
    out.push(new Date(d));
  };

  if (schedule.frequencyType === "ONE_TIME") { push(startLocal); return out; }
  const interval = Math.max(1, schedule.recurrenceInterval ?? 1);
  const unit = schedule.recurrenceUnit ?? "DAY";

  if (["MINUTE","HOUR","DAY"].includes(unit)) {
    const step = interval * (unit === "MINUTE" ? 60000 : unit === "HOUR" ? 3600000 : 86400000);
    const firstIndex = Math.max(0, ceilDiv(fromLocal.getTime() - startLocal.getTime(), step));
    for (let t = startLocal.getTime() + firstIndex * step; t <= throughLocal.getTime(); t += step) push(new Date(t));
    return out;
  }

  if (unit === "WEEK") {
    const cfg = (schedule.recurrenceConfig ?? {}) as { weekdays?: number[] };
    const selected = cfg.weekdays?.length ? cfg.weekdays : [startLocal.getUTCDay()];
    const firstDay = new Date(Date.UTC(fromLocal.getUTCFullYear(), fromLocal.getUTCMonth(), fromLocal.getUTCDate(), startLocal.getUTCHours(), startLocal.getUTCMinutes()));
    firstDay.setUTCDate(firstDay.getUTCDate() - 1);
    const anchorDate = new Date(Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate()));
    const anchorWeekStart = new Date(anchorDate); anchorWeekStart.setUTCDate(anchorWeekStart.getUTCDate() - anchorWeekStart.getUTCDay());
    for (let d = new Date(firstDay); d <= throughLocal; d.setUTCDate(d.getUTCDate()+1)) {
      if (!selected.includes(d.getUTCDay())) continue;
      const dayOnly = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const weekStart = new Date(dayOnly); weekStart.setUTCDate(weekStart.getUTCDate()-weekStart.getUTCDay());
      const weeks = Math.floor((weekStart.getTime()-anchorWeekStart.getTime())/(7*86400000));
      if (weeks >= 0 && weeks % interval === 0) push(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),startLocal.getUTCHours(),startLocal.getUTCMinutes())));
    }
    return out;
  }

  if (unit === "MONTH") {
    const cfg = (schedule.recurrenceConfig ?? {}) as { monthDays?: number[] };
    const selected = cfg.monthDays?.length ? cfg.monthDays : [startLocal.getUTCDate()];
    let monthIndex = fromLocal.getUTCFullYear()*12 + fromLocal.getUTCMonth();
    const anchor = startLocal.getUTCFullYear()*12 + startLocal.getUTCMonth();
    if (monthIndex < anchor) monthIndex = anchor;
    for (; monthIndex <= throughLocal.getUTCFullYear()*12+throughLocal.getUTCMonth(); monthIndex++) {
      if ((monthIndex-anchor) % interval !== 0) continue;
      const y=Math.floor(monthIndex/12), m=monthIndex%12;
      for (const day of selected) {
        const d=new Date(Date.UTC(y,m,day,startLocal.getUTCHours(),startLocal.getUTCMinutes()));
        if (d.getUTCMonth()===m) push(d);
      }
    }
    return out;
  }

  if (unit === "YEAR") {
    let year = Math.max(fromLocal.getUTCFullYear(), startLocal.getUTCFullYear());
    const anchor = startLocal.getUTCFullYear();
    for (; year <= throughLocal.getUTCFullYear(); year++) {
      if ((year-anchor) % interval !== 0) continue;
      const d=new Date(Date.UTC(year,startLocal.getUTCMonth(),startLocal.getUTCDate(),startLocal.getUTCHours(),startLocal.getUTCMinutes()));
      if (d.getUTCMonth()===startLocal.getUTCMonth()) push(d);
    }
  }
  return out;
}

function deterministicIndex(scheduleTaskId: string, block: number, n: number) {
  let hash = 2166136261;
  const text = `${scheduleTaskId}:${block}`;
  for (let i=0;i<text.length;i++){ hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % n;
}

function evidenceDecision(task: any, occurrenceOrdinal: number) {
  if (task.evidenceRule === "PHOTO") return { required: true, type: "PHOTO" as const };
  if (task.evidenceRule === "VIDEO") return { required: true, type: "VIDEO" as const };
  if (task.evidenceRule !== "RANDOM") return { required: false, type: null };
  const n = Math.max(2, task.randomEveryN ?? 3);
  const block = Math.floor(occurrenceOrdinal / n);
  const position = occurrenceOrdinal % n;
  return { required: position === deterministicIndex(task.id, block, n), type: task.randomEvidenceType ?? "EITHER" };
}

export async function reconcileScheduleOccurrences(scheduleId: string, opts?: { through?: Date; userId?: string | null; reason?: string }) {
  const now = new Date();
  const through = opts?.through ?? new Date(now.getTime() + HORIZON_HOURS * 3600000);
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      organization: true,
      workArea: { include: { property: true } },
      scheduleTasks: { include: { task: true }, orderBy: { sequence: "asc" } }
    }
  });
  if (!schedule || schedule.status !== "ACTIVE" || schedule.workArea.status !== "ACTIVE" || schedule.workArea.property.status !== "ACTIVE") return { created: 0, skipped: 0 };
  const totalDuration = schedule.scheduleTasks.reduce((sum, t) => sum + t.durationMinutes, 0);
  if (!schedule.scheduleTasks.length || totalDuration <= 0) return { created: 0, skipped: 0 };

  if (opts?.reason === "edit") {
    await prisma.scheduleOccurrence.deleteMany({ where: { scheduleId: schedule.id, status: "PENDING", assignedUserId: null, scheduledStartAt: { gt: now } } });
  }

  const hours = effectiveWorkingHours(schedule.workArea.workingHours, schedule.workArea.property.workingHours, schedule.organization.workingHours);
  const localCandidates = candidates(schedule, now, through);
  let created = 0, skipped = 0;
  const priorCount = await prisma.scheduleOccurrence.count({ where: { scheduleId: schedule.id, status: { not: "CANCELED" }, scheduledStartAt: { lt: now } } });
  const existingFuture = await prisma.scheduleOccurrence.findMany({
    where: { scheduleId: schedule.id, scheduledStartAt: { gte: now, lte: through } },
    select: { scheduledStartAt: true, status: true }, orderBy: { scheduledStartAt: "asc" }
  });
  const existingKeys = new Set(existingFuture.map((x) => x.scheduledStartAt.getTime()));

  for (let i=0;i<localCandidates.length;i++) {
    const local = localCandidates[i];
    if (!scheduleFitsWorkingHours(hours, local, totalDuration)) { skipped++; continue; }
    const scheduledStartAt = zonedLocalToUtc(localString(local), schedule.timezone);
    if (scheduledStartAt < now && schedule.frequencyType !== "ONE_TIME") continue;
    const scheduledEndAt = new Date(scheduledStartAt.getTime() + totalDuration*60000);
    if (existingKeys.has(scheduledStartAt.getTime())) continue;
    const existingEarlier = existingFuture.filter((x) => x.status !== "CANCELED" && x.scheduledStartAt < scheduledStartAt).length;
    const ordinal = priorCount + existingEarlier + created;
    await prisma.$transaction(async tx => {
      const occurrence = await tx.scheduleOccurrence.create({ data: {
        organizationId: schedule.organizationId, scheduleId: schedule.id, workAreaId: schedule.workAreaId,
        scheduledStartAt, scheduledEndAt, timezone: schedule.timezone,
        scheduleNameSnapshot: schedule.name,
        documentReferenceSnapshot: schedule.documentReference,
        documentRevisionSnapshot: schedule.documentRevision,
        workAreaNameSnapshot: schedule.workArea.name,
        propertyNameSnapshot: schedule.workArea.property.name, plannedDurationMinutes: totalDuration
      }});
      for (const st of schedule.scheduleTasks) {
        const decision = evidenceDecision(st, ordinal);
        await tx.scheduleOccurrenceTask.create({ data: {
          occurrenceId: occurrence.id, taskId: st.taskId, sequence: st.sequence,
          taskNameSnapshot: st.task.name, taskDescriptionSnapshot: st.task.descriptionHtml,
          plannedDurationMinutes: st.durationMinutes,
          plannedStartAt: new Date(scheduledStartAt.getTime()+st.plannedStartOffsetMinutes*60000),
          plannedEndAt: new Date(scheduledStartAt.getTime()+st.plannedEndOffsetMinutes*60000),
          evidenceRuleSnapshot: st.evidenceRule,
          evidenceRequired: decision.required,
          evidenceTypeRequired: decision.type
        }});
      }
    });
    created++;
  }

  await prisma.schedule.update({ where: { id: schedule.id }, data: { occurrenceGeneratedThrough: through } });
  if (created || skipped) await audit({
    organizationId: schedule.organizationId, userId: opts?.userId ?? null,
    action: opts?.reason === "edit" ? "SCHEDULE_OCCURRENCES_RECONCILED" : "SCHEDULE_OCCURRENCES_GENERATED",
    entityType: "Schedule", entityId: schedule.id,
    metadata: { created, skippedOutsideWorkingHours: skipped, generatedThrough: through.toISOString(), reason: opts?.reason ?? "batch" }
  });
  return { created, skipped };
}

export async function generateRollingOccurrences() {
  const schedules = await prisma.schedule.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let created=0, skipped=0;
  for (const s of schedules) {
    const r=await reconcileScheduleOccurrences(s.id, { reason: "batch" }); created+=r.created; skipped+=r.skipped;
  }
  return { schedules: schedules.length, created, skipped };
}
