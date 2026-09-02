import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { zonedLocalToUtc } from "@/lib/schedule";

type QueryValue = string | string[] | undefined;
type SearchParams = Record<string, QueryValue>;

function first(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function localDate(daysBack: number, timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const d = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day))
  );
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function pct(completed: number, total: number) {
  if (!total) return "—";
  return `${((completed / total) * 100).toFixed(1)}%`;
}

function fmt(value: Date | null, tz: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short"
  }).format(value);
}

export default async function CompliancePage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });

  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
    redirect("/dashboard");
  }

  const query = await searchParams;
  const propertyId = first(query.propertyId);
  const workAreaId = first(query.workAreaId);
  const scheduleId = first(query.scheduleId);
  const userId = first(query.userId);
  const status = first(query.status);

  const defaultFrom = localDate(6, membership.organization.timezone);
  const defaultTo = localDate(0, membership.organization.timezone);
  const dateFrom = validDate(first(query.dateFrom)) || defaultFrom;
  const dateTo = validDate(first(query.dateTo)) || defaultTo;

  const start = zonedLocalToUtc(
    `${dateFrom}T00:00`,
    membership.organization.timezone
  );
  const end = zonedLocalToUtc(
    `${nextDate(dateTo)}T00:00`,
    membership.organization.timezone
  );

  const [properties, workAreas, schedules, members, occurrences] =
    await Promise.all([
      prisma.property.findMany({
        where: { organizationId: membership.organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      prisma.workArea.findMany({
        where: {
          property: { organizationId: membership.organizationId },
          ...(propertyId ? { propertyId } : {})
        },
        select: {
          id: true,
          name: true,
          property: { select: { name: true } }
        },
        orderBy: { name: "asc" }
      }),
      prisma.schedule.findMany({
        where: {
          organizationId: membership.organizationId,
          ...(workAreaId ? { workAreaId } : {})
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      prisma.organizationMember.findMany({
        where: { organizationId: membership.organizationId },
        select: {
          user: { select: { id: true, name: true, email: true } }
        }
      }),
      prisma.scheduleOccurrence.findMany({
        where: {
          organizationId: membership.organizationId,
          scheduledStartAt: { gte: start, lt: end },
          status: {
            in: ["COMPLETED", "PARTIALLY_COMPLETED", "MISSED"],
            ...(status ? { equals: status as any } : {})
          },
          ...(workAreaId ? { workAreaId } : {}),
          ...(scheduleId ? { scheduleId } : {}),
          ...(userId ? { assignedUserId: userId } : {}),
          ...(propertyId ? { workArea: { propertyId } } : {})
        },
        include: {
          assignedUser: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { scheduledStartAt: "desc" },
        take: 1000
      })
    ]);

  const completed = occurrences.filter((o) => o.status === "COMPLETED").length;
  const partial = occurrences.filter(
    (o) => o.status === "PARTIALLY_COMPLETED"
  ).length;
  const missed = occurrences.filter((o) => o.status === "MISSED").length;
  const serviceCompliant = completed + partial;

  type Bucket = {
    label: string;
    completed: number;
    partial: number;
    missed: number;
    total: number;
  };

  function bucketBy(
    selector: (row: (typeof occurrences)[number]) => string
  ): Bucket[] {
    const map = new Map<string, Bucket>();
    for (const row of occurrences) {
      const label = selector(row) || "Unassigned";
      const item =
        map.get(label) ??
        { label, completed: 0, partial: 0, missed: 0, total: 0 };
      item.total++;
      if (row.status === "COMPLETED") item.completed++;
      if (row.status === "PARTIALLY_COMPLETED") item.partial++;
      if (row.status === "MISSED") item.missed++;
      map.set(label, item);
    }
    return [...map.values()].sort(
      (a, b) =>
        b.missed - a.missed ||
        b.total - a.total ||
        a.label.localeCompare(b.label)
    );
  }

  const scheduleSummary = bucketBy((o) => o.scheduleNameSnapshot);
  const propertySummary = bucketBy((o) => o.propertyNameSnapshot);
  const workAreaSummary = bucketBy((o) => o.workAreaNameSnapshot);
  const userSummary = bucketBy(
    (o) => o.assignedUser?.name ?? o.assignedUser?.email ?? "Unassigned"
  );

  return (
    <>
      <Nav />
      <main className="container" style={{ maxWidth: 1500 }}>
        <div className="breadcrumbs">
          <Link href="/reports">Reports</Link> / Service Compliance
        </div>
        <h1>Service Compliance & Analytics</h1>
        <p className="muted">
          Occurrence-level compliance. Completed, partially completed and missed
          history is preserved; superseded recurring work remains visible as
          MISSED even though it is removed from the mobile action queue.
        </p>

        <form method="get" className="card" style={{ marginBottom: 18 }}>
          <div className="formGrid">
            <label>
              From
              <input type="date" name="dateFrom" defaultValue={dateFrom} />
            </label>
            <label>
              To
              <input type="date" name="dateTo" defaultValue={dateTo} />
            </label>
            <label>
              Property
              <select name="propertyId" defaultValue={propertyId}>
                <option value="">All Properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              Work Area
              <select name="workAreaId" defaultValue={workAreaId}>
                <option value="">All Work Areas</option>
                {workAreas.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.property.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Schedule
              <select name="scheduleId" defaultValue={scheduleId}>
                <option value="">All Schedules</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>
              User
              <select name="userId" defaultValue={userId}>
                <option value="">All Users</option>
                {members
                  .sort((a, b) =>
                    (a.user.name ?? a.user.email).localeCompare(
                      b.user.name ?? b.user.email
                    )
                  )
                  .map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name ?? m.user.email}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={status}>
                <option value="">All final statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PARTIALLY_COMPLETED">Partially Completed</option>
                <option value="MISSED">Missed</option>
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="button" type="submit">Apply Filters</button>
            <Link className="button secondary" href="/reports/compliance">
              Reset
            </Link>
          </div>
        </form>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
            gap: 12,
            marginBottom: 18
          }}
        >
          <Kpi label="Occurrences" value={occurrences.length} />
          <Kpi label="Completed" value={completed} />
          <Kpi label="Partial" value={partial} />
          <Kpi label="Missed" value={missed} />
          <Kpi
            label="Service compliance"
            value={pct(serviceCompliant, occurrences.length)}
          />
        </div>

        <Summary title="By Schedule" rows={scheduleSummary} />
        <Summary title="By Property" rows={propertySummary} />
        <Summary title="By Work Area" rows={workAreaSummary} />
        <Summary title="By User" rows={userSummary} />

        <div className="card" style={{ marginTop: 18, overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>Occurrence Detail</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Scheduled</th>
                <th>Property</th>
                <th>Work Area</th>
                <th>Schedule</th>
                <th>Document Ref.</th>
                <th>Revision</th>
                <th>Status</th>
                <th>User</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => (
                <tr key={o.id}>
                  <td>{fmt(o.scheduledStartAt, o.timezone)}</td>
                  <td>{o.propertyNameSnapshot}</td>
                  <td>{o.workAreaNameSnapshot}</td>
                  <td>{o.scheduleNameSnapshot}</td>
                  <td>{o.documentReferenceSnapshot ?? "—"}</td>
                  <td>{o.documentRevisionSnapshot ?? "—"}</td>
                  <td>{o.status.replaceAll("_", " ")}</td>
                  <td>{o.assignedUser?.name ?? o.assignedUser?.email ?? "—"}</td>
                  <td>{o.missedReason ?? "—"}</td>
                  <td>
                    <Link href={`/reports/occurrences/${o.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
              {!occurrences.length ? (
                <tr>
                  <td colSpan={10} className="muted">
                    No finalized occurrences match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: Array<any> }) {
  return (
    <div className="card" style={{ marginTop: 18, overflowX: "auto" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <table className="table">
        <thead>
          <tr>
            <th>{title.replace("By ", "")}</th>
            <th>Total</th>
            <th>Completed</th>
            <th>Partial</th>
            <th>Missed</th>
            <th>Compliance</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.total}</td>
              <td>{r.completed}</td>
              <td>{r.partial}</td>
              <td>{r.missed}</td>
              <td>{pct(r.completed + r.partial, r.total)}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={6} className="muted">No data.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
