import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { zonedLocalToUtc } from "@/lib/schedule";
import { createEvidenceSignedDownload } from "@/lib/supabaseStorage";
import { assignedPropertyIds } from "@/lib/propertyAccess";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

type PresenceRow = {
  organization_id: string;
  user_id: string;
  active_since_at: Date;
  last_seen_at: Date;
  is_active: boolean;
};

function localDateKey(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function nextDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function effectiveActualSeconds(input: {
  actualDurationSeconds: number | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
}) {
  if (input.actualDurationSeconds != null) return input.actualDurationSeconds;
  if (input.actualStartAt && input.actualEndAt) {
    return Math.max(0, Math.floor((input.actualEndAt.getTime() - input.actualStartAt.getTime()) / 1000));
  }
  return null;
}

function mobileLoginForOrganization(metadata: unknown, organizationId: string) {
  if (!metadata || typeof metadata !== "object") return false;
  const value = metadata as { method?: unknown; memberships?: unknown };
  return value.method === "mobile_magic_link"
    && Array.isArray(value.memberships)
    && value.memberships.includes(organizationId);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401 });

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true },
  });

  if (!membership || !["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
    return Response.json({ error: "Dashboard access requires Admin or Property Manager role." }, { status: 403 });
  }

  const organizationId = membership.organizationId;
  const propertyScopeIds = await assignedPropertyIds(membership);
  const occurrenceScope = propertyScopeIds ? { workArea: { propertyId: { in: propertyScopeIds } } } : {};
  const timeZone = membership.organization.timezone;
  const now = new Date();
  const todayKey = localDateKey(now, timeZone);
  const startOfDay = zonedLocalToUtc(`${todayKey}T00:00`, timeZone);
  const endOfDay = zonedLocalToUtc(`${nextDateKey(todayKey)}T00:00`, timeZone);
  const onlineAfter = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const members = await prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", role: "USER", ...(propertyScopeIds ? { propertyAssignments: { some: { propertyId: { in: propertyScopeIds } } } } : {}) },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const userIds = members.map((item) => item.userId);

  let presenceAvailable = true;
  let presenceRows: PresenceRow[] = [];
  try {
    presenceRows = await prisma.$queryRaw<PresenceRow[]>`
      SELECT organization_id, user_id, active_since_at, last_seen_at, is_active
      FROM user_presence
      WHERE organization_id = ${organizationId}
    `;
  } catch {
    presenceAvailable = false;
  }

  const [activeOccurrences, loginEvents, completedToday, progressRows, feedRows, evidenceRows, attentionRows, reportedRows] = await Promise.all([
    prisma.scheduleOccurrence.findMany({
      where: {
        organizationId,
        ...occurrenceScope,
        status: "IN_PROGRESS",
        assignedUserId: userIds.length ? { in: userIds } : undefined,
      },
      include: {
        tasks: { orderBy: { sequence: "asc" } },
      },
      orderBy: { startedAt: "asc" },
    }),
    userIds.length
      ? prisma.auditLog.findMany({
          where: { action: "LOGIN", userId: { in: userIds } },
          select: { userId: true, createdAt: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : Promise.resolve([]),
    prisma.scheduleOccurrenceTask.findMany({
      where: {
        status: "COMPLETED",
        actualEndAt: { gte: startOfDay, lt: endOfDay },
        occurrence: { organizationId, ...occurrenceScope },
      },
      select: {
        actualDurationSeconds: true,
        actualStartAt: true,
        actualEndAt: true,
        plannedDurationMinutes: true,
      },
    }),
    prisma.scheduleOccurrence.findMany({
      where: { organizationId, ...occurrenceScope, scheduledStartAt: { gte: startOfDay, lt: endOfDay } },
      select: { status: true, scheduledEndAt: true },
    }),
    prisma.scheduleOccurrenceTask.findMany({
      where: {
        status: "COMPLETED",
        actualEndAt: { not: null },
        occurrence: { organizationId, ...occurrenceScope },
      },
      include: {
        occurrence: {
          include: { assignedUser: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { actualEndAt: "desc" },
      take: 40,
    }),
    prisma.scheduleOccurrenceEvidence.findMany({
      where: { occurrenceTask: { occurrence: { organizationId, ...occurrenceScope } } },
      include: {
        capturedBy: { select: { id: true, name: true, email: true } },
        occurrenceTask: {
          include: {
            occurrence: {
              include: { assignedUser: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
      orderBy: { capturedAt: "desc" },
      take: 20,
    }),
    prisma.scheduleOccurrence.findMany({
      where: {
        organizationId,
        ...occurrenceScope,
        OR: [
          { status: "PENDING", scheduledEndAt: { lt: now } },
          { status: "MISSED", scheduledStartAt: { gte: startOfDay, lt: endOfDay } },
          { status: "PARTIALLY_COMPLETED", scheduledStartAt: { gte: startOfDay, lt: endOfDay } },
        ],
      },
      include: { assignedUser: { select: { name: true, email: true } } },
      orderBy: { scheduledStartAt: "asc" },
      take: 10,
    }),
    prisma.reportedWorkItem.findMany({
      where: { organizationId, status: "NEW", ...(propertyScopeIds ? { propertyId: { in: propertyScopeIds } } : {}) },
      include: { property: { select: { name: true } }, workArea: { select: { name: true } }, reportedBy: { select: { name: true, email: true } } },
      orderBy: { reportedAt: "desc" },
      take: 20
    }),
  ]);

  const presenceByUser = new Map(presenceRows.map((row) => [row.user_id, row]));
  const occurrenceByUser = new Map(
    activeOccurrences
      .filter((row) => row.assignedUserId)
      .map((row) => [row.assignedUserId as string, row]),
  );

  const lastLoginByUser = new Map<string, Date>();
  for (const event of loginEvents) {
    if (!event.userId || lastLoginByUser.has(event.userId)) continue;
    if (mobileLoginForOrganization(event.metadata, organizationId)) {
      lastLoginByUser.set(event.userId, event.createdAt);
    }
  }

  const workforce = members.map((member) => {
    const presence = presenceByUser.get(member.userId);
    const occurrence = occurrenceByUser.get(member.userId);
    const currentTask = occurrence?.tasks.find((task) => task.status === "IN_PROGRESS")
      ?? occurrence?.tasks.find((task) => task.status === "PENDING")
      ?? null;
    const online = Boolean(
      presence?.is_active
      && presence.last_seen_at >= onlineAfter,
    );

    return {
      userId: member.userId,
      userName: member.user.name ?? member.user.email,
      email: member.user.email,
      status: occurrence ? (online ? "WORKING" : "WORKING_OFFLINE") : (online ? "ONLINE" : "OFFLINE"),
      online,
      lastLoginAt: lastLoginByUser.get(member.userId)?.toISOString() ?? null,
      activeSinceAt: online ? presence?.active_since_at.toISOString() ?? null : null,
      lastSeenAt: presence?.last_seen_at.toISOString() ?? null,
      propertyName: occurrence?.propertyNameSnapshot ?? null,
      workAreaName: occurrence?.workAreaNameSnapshot ?? null,
      scheduleName: occurrence?.scheduleNameSnapshot ?? null,
      currentTaskName: currentTask?.taskNameSnapshot ?? null,
      currentTaskStartedAt: currentTask?.actualStartAt?.toISOString() ?? null,
      workAreaStartedAt: occurrence?.startedAt?.toISOString() ?? null,
    };
  });

  const onlineUsers = workforce.filter((item) => item.online).length;
  const deviations = completedToday
    .map((task) => {
      const actual = effectiveActualSeconds(task);
      return actual == null ? null : actual - task.plannedDurationMinutes * 60;
    })
    .filter((value): value is number => value != null);
  const averageDeviationSeconds = deviations.length
    ? Math.round(deviations.reduce((sum, value) => sum + value, 0) / deviations.length)
    : null;

  const progress = {
    completed: 0,
    inProgress: 0,
    upcoming: 0,
    overdue: 0,
    missed: 0,
    partial: 0,
  };
  for (const row of progressRows) {
    if (row.status === "COMPLETED") progress.completed += 1;
    else if (row.status === "IN_PROGRESS") progress.inProgress += 1;
    else if (row.status === "MISSED") progress.missed += 1;
    else if (row.status === "PARTIALLY_COMPLETED") progress.partial += 1;
    else if (row.status === "PENDING" && row.scheduledEndAt < now) progress.overdue += 1;
    else if (row.status === "PENDING") progress.upcoming += 1;
  }

  const feed = feedRows.map((task) => {
    const actualSeconds = effectiveActualSeconds(task);
    return {
      id: task.id,
      timestamp: task.actualEndAt?.toISOString() ?? task.updatedAt.toISOString(),
      taskName: task.taskNameSnapshot,
      sequence: task.sequence,
      actualSeconds,
      plannedSeconds: task.plannedDurationMinutes * 60,
      deviationSeconds: actualSeconds == null ? null : actualSeconds - task.plannedDurationMinutes * 60,
      userName: task.occurrence.assignedUser?.name ?? task.occurrence.assignedUser?.email ?? "Unassigned",
      propertyName: task.occurrence.propertyNameSnapshot,
      workAreaName: task.occurrence.workAreaNameSnapshot,
      scheduleName: task.occurrence.scheduleNameSnapshot,
    };
  });

  const evidence = await Promise.all(evidenceRows.map(async (item) => {
    let signedUrl: string | null = null;
    try {
      signedUrl = await createEvidenceSignedDownload(item.storagePath, 15 * 60);
    } catch {
      signedUrl = null;
    }
    const occurrence = item.occurrenceTask.occurrence;
    return {
      id: item.id,
      type: item.type,
      mimeType: item.mimeType,
      capturedAt: item.capturedAt.toISOString(),
      signedUrl,
      taskName: item.occurrenceTask.taskNameSnapshot,
      scheduleName: occurrence.scheduleNameSnapshot,
      propertyName: occurrence.propertyNameSnapshot,
      workAreaName: occurrence.workAreaNameSnapshot,
      userName: item.capturedBy.name ?? item.capturedBy.email,
    };
  }));

  const scheduleAttention = attentionRows.map((item) => ({ kind: "SCHEDULE" as const, id: item.id, status: item.status, scheduleName: item.scheduleNameSnapshot, propertyName: item.propertyNameSnapshot, workAreaName: item.workAreaNameSnapshot, scheduledStartAt: item.scheduledStartAt.toISOString(), scheduledEndAt: item.scheduledEndAt.toISOString(), userName: item.assignedUser?.name ?? item.assignedUser?.email ?? null, propertyId: null, workAreaId: item.workAreaId, note: null, reportedAt: null, reportedBy: null }));
  const reportedAttention = reportedRows.map((item) => ({ kind: "REPORTED_WORK" as const, id: item.id, status: item.status, scheduleName: item.sourceScheduleName ?? (item.noteScope === "TASK" ? item.sourceTaskName ?? "Task Note" : "Schedule Note"), propertyName: item.property.name, workAreaName: item.workArea.name, scheduledStartAt: item.reportedAt.toISOString(), scheduledEndAt: item.reportedAt.toISOString(), userName: null, propertyId: item.propertyId, workAreaId: item.workAreaId, note: item.noteText, reportedAt: item.reportedAt.toISOString(), reportedBy: item.reportedBy.name ?? item.reportedBy.email }));
  const attention = [...reportedAttention, ...scheduleAttention];

  const response = Response.json({
    generatedAt: now.toISOString(),
    organizationName: membership.organization.name,
    timeZone,
    presenceAvailable,
    kpis: {
      usersOnline: onlineUsers,
      usersTotal: workforce.length,
      schedulesInProgress: activeOccurrences.length,
      tasksCompletedToday: completedToday.length,
      overdueOrMissed: progress.overdue + progress.missed + progress.partial + reportedRows.length,
      averageDeviationSeconds,
    },
    workforce,
    feed,
    evidence,
    attention,
    progress,
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
