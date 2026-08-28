import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type QueryValue = string | string[] | undefined;
type SearchParams = Record<string, QueryValue>;

function first(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function durationFromSeconds(totalSeconds: number | null | undefined) {
  if (totalSeconds == null) return "—";
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function plannedDuration(minutes: number) {
  return durationFromSeconds(minutes * 60);
}

function deviation(actualSeconds: number | null | undefined, plannedMinutes: number) {
  if (actualSeconds == null) return "—";
  const difference = Math.floor(actualSeconds) - plannedMinutes * 60;
  if (difference === 0) return "00:00:00";
  const sign = difference > 0 ? "+" : "−";
  return `${sign}${durationFromSeconds(Math.abs(difference))}`;
}

function formatDate(value: Date | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatTime(value: Date | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(value);
}

export default async function ServiceLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true },
  });

  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) redirect("/dashboard");

  const query = await searchParams;
  const propertyId = first(query.propertyId);
  const workAreaId = first(query.workAreaId);
  const scheduleId = first(query.scheduleId);
  const userId = first(query.userId);

  const [properties, workAreas, schedules, members, rows] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.workArea.findMany({
      where: {
        property: { organizationId: membership.organizationId },
        ...(propertyId ? { propertyId } : {}),
      },
      include: { property: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.schedule.findMany({
      where: {
        organizationId: membership.organizationId,
        ...(workAreaId ? { workAreaId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, workAreaId: true },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.scheduleOccurrenceTask.findMany({
      where: {
        status: "COMPLETED",
        actualStartAt: { not: null },
        occurrence: {
          organizationId: membership.organizationId,
          ...(propertyId ? { workArea: { propertyId } } : {}),
          ...(workAreaId ? { workAreaId } : {}),
          ...(scheduleId ? { scheduleId } : {}),
          ...(userId ? { assignedUserId: userId } : {}),
        },
      },
      include: {
        occurrence: {
          include: {
            assignedUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { actualStartAt: "desc" },
      take: 500,
    }),
  ]);

  const sortedMembers = [...members].sort((a, b) =>
    (a.user.name ?? a.user.email).localeCompare(b.user.name ?? b.user.email),
  );

  return (
    <>
      <Nav />
      <main className="container" style={{ maxWidth: 1600 }}>
        <div className="breadcrumbs"><Link href="/reports">Reports</Link> / Service Log</div>
        <h1>Service Log</h1>
        <p className="muted">
          One row per completed Task performance. Times are shown in the Schedule occurrence timezone.
          Showing the latest 500 matching rows.
        </p>

        <form method="get" className="card" style={{ marginBottom: 20 }}>
          <div className="formGrid">
            <label>
              Property
              <select name="propertyId" defaultValue={propertyId}>
                <option value="">All Properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </label>

            <label>
              Work Area
              <select name="workAreaId" defaultValue={workAreaId}>
                <option value="">All Work Areas</option>
                {workAreas.map((workArea) => (
                  <option key={workArea.id} value={workArea.id}>
                    {workArea.name} — {workArea.property.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Task List
              <select name="scheduleId" defaultValue={scheduleId}>
                <option value="">All Task Lists</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>{schedule.name}</option>
                ))}
              </select>
            </label>

            <label>
              User
              <select name="userId" defaultValue={userId}>
                <option value="">All Users</option>
                {sortedMembers.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name ?? member.user.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="button" type="submit">Apply Filters</button>
            <Link className="button secondary" href="/reports/service-log">Clear</Link>
          </div>
        </form>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 1500 }}>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Work Area</th>
                  <th>Task List</th>
                  <th>Sr. No.</th>
                  <th>Task Performed</th>
                  <th>Actual Time Taken</th>
                  <th>Scheduled Time</th>
                  <th>Deviation</th>
                  <th>User</th>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const occurrence = row.occurrence;
                  const effectiveActualSeconds = row.actualDurationSeconds ??
                    (row.actualStartAt && row.actualEndAt
                      ? Math.max(0, Math.floor((row.actualEndAt.getTime() - row.actualStartAt.getTime()) / 1000))
                      : null);
                  const performedBy = occurrence.assignedUser?.name ?? occurrence.assignedUser?.email ?? "—";

                  return (
                    <tr key={row.id}>
                      <td>{occurrence.propertyNameSnapshot}</td>
                      <td>{occurrence.workAreaNameSnapshot}</td>
                      <td>{occurrence.scheduleNameSnapshot}</td>
                      <td>{row.sequence}</td>
                      <td><strong>{row.taskNameSnapshot}</strong></td>
                      <td>{durationFromSeconds(effectiveActualSeconds)}</td>
                      <td>{plannedDuration(row.plannedDurationMinutes)}</td>
                      <td>{deviation(effectiveActualSeconds, row.plannedDurationMinutes)}</td>
                      <td>{performedBy}</td>
                      <td>{formatDate(row.actualStartAt, occurrence.timezone)}</td>
                      <td>{formatTime(row.actualStartAt, occurrence.timezone)}</td>
                      <td>{formatTime(row.actualEndAt, occurrence.timezone)}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={12} className="muted">No completed Task performances match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
