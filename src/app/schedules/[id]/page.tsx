import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ScheduleEditor } from "@/components/ScheduleEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { minutesToDuration, formatInZone } from "@/lib/schedule";

function localInputValue(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export default async function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      workArea: { include: { property: true } },
      scheduleTasks: { include: { task: true }, orderBy: { sequence: "asc" } }
    }
  });
  if (!schedule) notFound();

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: schedule.organizationId, userId: user.id } },
    include: { organization: true }
  });
  if (!membership || membership.status !== "ACTIVE") notFound();

  const [workAreas, tasks] = await Promise.all([
    prisma.workArea.findMany({
      where: { property: { organizationId: schedule.organizationId } },
      include: { property: true },
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.task.findMany({ where: { organizationId: schedule.organizationId }, orderBy: { name: "asc" } })
  ]);

  const canManage = ["ADMIN", "PROPERTY_MANAGER"].includes(membership.role);
  const initial = {
    id: schedule.id,
    name: schedule.name,
    frequencyType: schedule.frequencyType,
    recurrenceUnit: schedule.recurrenceUnit,
    recurrenceInterval: schedule.recurrenceInterval,
    recurrenceConfig: (schedule.recurrenceConfig ?? null) as { weekdays?: number[]; monthDays?: number[] } | null,
    startLocal: localInputValue(schedule.startAt, schedule.timezone),
    timezone: schedule.timezone,
    workAreaId: schedule.workAreaId,
    status: schedule.status,
    items: schedule.scheduleTasks.map((item) => ({
      id: item.id,
      taskId: item.taskId,
      taskName: item.task.name,
      duration: minutesToDuration(item.durationMinutes),
      evidenceRule: item.evidenceRule,
      randomEveryN: item.randomEveryN ?? 3,
      randomEvidenceType: item.randomEvidenceType ?? "EITHER"
    }))
  };

  const waOptions = workAreas.map((wa) => ({
    id: wa.id,
    name: wa.name,
    propertyName: wa.property.name,
    timezone: wa.property.timezone || membership.organization.timezone,
    status: wa.status,
    propertyStatus: wa.property.status
  }));
  const taskOptions = tasks.map((task) => ({ id: task.id, name: task.name, status: task.status }));

  return <><Nav/><main className="container">
    <div className="row"><div style={{ marginRight: "auto" }}>
      <h1>{schedule.name}</h1>
      <p className="muted">{schedule.workArea.name} — {schedule.workArea.property.name} · {schedule.status}</p>
    </div></div>
    <p className="muted">First occurrence: {formatInZone(schedule.startAt, schedule.timezone)} ({schedule.timezone})</p>
    <ScheduleEditor canManage={canManage} workAreas={waOptions} tasks={taskOptions} initial={initial as any}/>
  </main></>;
}
