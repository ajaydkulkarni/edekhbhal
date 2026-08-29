import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function fmt(value: Date | null | undefined, tz: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

export default async function WorkAreaServiceStatus({
  params
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const workArea = await prisma.workArea.findFirst({
    where: {
      id,
      property: { organizationId: membership.organizationId }
    },
    include: {
      property: true,
      qrCodes: {
        where: { status: "ACTIVE" },
        orderBy: { generatedAt: "desc" },
        take: 1
      }
    }
  });

  if (!workArea) notFound();

  const tz =
    workArea.property.timezone ||
    membership.organization.timezone ||
    "UTC";

  const [lastService, nextService, history] = await Promise.all([
    prisma.scheduleOccurrence.findFirst({
      where: {
        organizationId: membership.organizationId,
        workAreaId: id,
        status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] }
      },
      orderBy: { completedAt: "desc" }
    }),
    prisma.scheduleOccurrence.findFirst({
      where: {
        organizationId: membership.organizationId,
        workAreaId: id,
        status: "PENDING",
        scheduledStartAt: { gte: new Date() }
      },
      orderBy: { scheduledStartAt: "asc" }
    }),
    prisma.scheduleOccurrence.findMany({
      where: {
        organizationId: membership.organizationId,
        workAreaId: id,
        status: { in: ["COMPLETED", "PARTIALLY_COMPLETED", "MISSED"] }
      },
      orderBy: { scheduledStartAt: "desc" },
      take: 20
    })
  ]);

  const activeQr = workArea.qrCodes[0];

  return (
    <>
      <Nav />
      <main className="container" style={{ maxWidth: 1200 }}>
        <div className="breadcrumbs">
          <Link href="/work-areas">Work Areas</Link> / Service Status
        </div>
        <h1>{workArea.name}</h1>
        <p className="muted">
          {workArea.property.name}
          {workArea.locationIdentifier
            ? ` · ${workArea.locationIdentifier}`
            : ""}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 16,
            marginBottom: 16
          }}
        >
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Public Work Area QR</h2>
            {activeQr ? (
              <>
                <p className="muted">
                  A normal phone camera can scan the printed QR and open the
                  public service-status page without logging in.
                </p>
                <Link
                  className="button"
                  href={`/qr/${activeQr.id}`}
                  target="_blank"
                >
                  Open Public QR Status
                </Link>
              </>
            ) : (
              <p>No active QR currently exists for this Work Area.</p>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Last Service</h2>
            {lastService ? (
              <>
                <strong>{lastService.scheduleNameSnapshot}</strong>
                <p>{lastService.status.replaceAll("_", " ")}</p>
                <p className="muted">
                  {fmt(lastService.completedAt, lastService.timezone)}
                </p>
              </>
            ) : (
              <p>No completed service recorded.</p>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Next Service</h2>
            {nextService ? (
              <>
                <strong>{nextService.scheduleNameSnapshot}</strong>
                <p className="muted">
                  {fmt(nextService.scheduledStartAt, nextService.timezone)}
                </p>
              </>
            ) : (
              <p>No upcoming service currently scheduled.</p>
            )}
          </div>
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>Recent Service History</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Scheduled</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Completed</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{fmt(item.scheduledStartAt, item.timezone)}</td>
                  <td>{item.scheduleNameSnapshot}</td>
                  <td>{item.status.replaceAll("_", " ")}</td>
                  <td>{fmt(item.completedAt, item.timezone)}</td>
                  <td>{item.missedReason ?? "—"}</td>
                  <td>
                    <Link href={`/reports/occurrences/${item.id}`}>Detail</Link>
                  </td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td colSpan={6} className="muted">No service history yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
