import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDateTime(value: Date | null | undefined, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function relativeAgo(value: Date | null | undefined) {
  if (!value) return "No completed service recorded";
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "Serviced less than a minute ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Serviced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Serviced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Serviced ${days} day${days === 1 ? "" : "s"} ago`;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function QrLanding({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // token is the opaque QR record ID embedded in the printed QR URL.
  // Revoked/regenerated QR records do not expose Work Area data.
  const qr = await prisma.qrCode.findUnique({
    where: { id: token },
    include: {
      workArea: {
        include: {
          property: {
            include: { organization: true }
          }
        }
      }
    }
  });

  if (!qr || qr.status !== "ACTIVE") notFound();

  const wa = qr.workArea;
  const organizationId = wa.property.organizationId;
  const timeZone =
    wa.property.timezone ||
    wa.property.organization.timezone ||
    "UTC";

  const [lastCompleted, recent, nextScheduled] = await Promise.all([
    prisma.scheduleOccurrence.findFirst({
      where: {
        organizationId,
        workAreaId: wa.id,
        status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] },
        completedAt: { not: null }
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        scheduleNameSnapshot: true,
        status: true,
        completedAt: true,
        actualDurationSeconds: true
      }
    }),
    prisma.scheduleOccurrence.findMany({
      where: {
        organizationId,
        workAreaId: wa.id,
        status: { in: ["COMPLETED", "PARTIALLY_COMPLETED", "MISSED"] }
      },
      orderBy: { scheduledStartAt: "desc" },
      take: 5,
      select: {
        id: true,
        scheduleNameSnapshot: true,
        status: true,
        scheduledStartAt: true,
        completedAt: true,
        actualDurationSeconds: true
      }
    }),
    prisma.scheduleOccurrence.findFirst({
      where: {
        organizationId,
        workAreaId: wa.id,
        status: "PENDING",
        scheduledStartAt: { gte: new Date() }
      },
      orderBy: { scheduledStartAt: "asc" },
      select: {
        scheduleNameSnapshot: true,
        scheduledStartAt: true
      }
    })
  ]);

  return (
    <main
      className="container"
      style={{ maxWidth: 760, paddingTop: 24, paddingBottom: 40 }}
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginBottom: 4 }}>
          eDekhbhal · Verified Work Area
        </p>
        <h1 style={{ marginTop: 0, marginBottom: 6 }}>{wa.name}</h1>
        <p style={{ marginTop: 0 }}>
          <strong>{wa.property.name}</strong>
          {wa.locationIdentifier ? ` · ${wa.locationIdentifier}` : ""}
        </p>
        {wa.description ? <p className="muted">{wa.description}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginBottom: 4 }}>Last Service</p>
        {lastCompleted ? (
          <>
            <h2 style={{ marginTop: 0 }}>{lastCompleted.scheduleNameSnapshot}</h2>
            <p>
              <strong>{statusLabel(lastCompleted.status)}</strong>
              {" · "}
              {formatDateTime(lastCompleted.completedAt, timeZone)}
            </p>
            <p className="muted">{relativeAgo(lastCompleted.completedAt)}</p>
            <p>
              Actual duration:{" "}
              <strong>{formatDuration(lastCompleted.actualDurationSeconds)}</strong>
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>No completed service yet</h2>
            <p className="muted">
              This Work Area does not yet have a completed service occurrence.
            </p>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginBottom: 4 }}>Next Scheduled Service</p>
        {nextScheduled ? (
          <>
            <h2 style={{ marginTop: 0 }}>{nextScheduled.scheduleNameSnapshot}</h2>
            <p>{formatDateTime(nextScheduled.scheduledStartAt, timeZone)}</p>
          </>
        ) : (
          <p>No upcoming service is currently scheduled.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent Service History</h2>
        {recent.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {recent.map((item) => (
              <div
                key={item.id}
                style={{
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: 10
                }}
              >
                <strong>{item.scheduleNameSnapshot}</strong>
                <div className="muted">
                  {statusLabel(item.status)} ·{" "}
                  {formatDateTime(
                    item.completedAt ?? item.scheduledStartAt,
                    timeZone
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No service history is available yet.</p>
        )}
      </div>

      <p
        className="muted"
        style={{ textAlign: "center", marginTop: 18, fontSize: 12 }}
      >
        Public service status only. Worker identity, notes, evidence and internal
        audit information are not exposed.
      </p>
      <p style={{ textAlign: "center", fontSize: 12 }}>
        <Link href="/">eDekhbhal</Link>
      </p>
    </main>
  );
}
