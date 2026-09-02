import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createEvidenceSignedDownload } from "@/lib/supabaseStorage";

function fmt(value: Date | null | undefined, tz: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(value);
}

function duration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const n = Math.max(0, Math.floor(seconds));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function OccurrenceDetail({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" }
  });
  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;

  const occurrence = await prisma.scheduleOccurrence.findFirst({
    where: {
      id,
      organizationId: membership.organizationId
    },
    include: {
      assignedUser: { select: { name: true, email: true } },
      tasks: {
        orderBy: { sequence: "asc" },
        include: {
          evidence: { orderBy: { capturedAt: "asc" } },
          notes: {
            orderBy: { createdAt: "asc" },
            include: { createdBy: { select: { name: true, email: true } } }
          }
        }
      },
      notes: {
        where: { scope: "SCHEDULE" },
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true, email: true } } }
      }
    }
  });

  if (!occurrence) notFound();

  const signed = new Map<string, string>();
  for (const task of occurrence.tasks) {
    for (const evidence of task.evidence) {
      try {
        signed.set(
          evidence.id,
          await createEvidenceSignedDownload(evidence.storagePath, 900)
        );
      } catch {
        // Reporting remains usable if storage is temporarily unavailable.
      }
    }
  }

  return (
    <>
      <Nav />
      <main className="container" style={{ maxWidth: 1200 }}>
        <div className="breadcrumbs">
          <Link href="/reports/compliance">Service Compliance</Link> / Occurrence
        </div>
        <h1>{occurrence.scheduleNameSnapshot}</h1>
        <p className="muted">
          {occurrence.propertyNameSnapshot} · {occurrence.workAreaNameSnapshot}
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="formGrid">
            <Fact label="Status" value={occurrence.status.replaceAll("_", " ")} />
            <Fact
              label="Scheduled"
              value={fmt(occurrence.scheduledStartAt, occurrence.timezone)}
            />
            <Fact
              label="Started"
              value={fmt(occurrence.startedAt, occurrence.timezone)}
            />
            <Fact
              label="Completed"
              value={fmt(occurrence.completedAt, occurrence.timezone)}
            />
            <Fact
              label="Actual duration"
              value={duration(occurrence.actualDurationSeconds)}
            />
            <Fact
              label="User"
              value={
                occurrence.assignedUser?.name ??
                occurrence.assignedUser?.email ??
                "—"
              }
            />
          </div>
          {occurrence.missedReason ? (
            <p style={{ marginBottom: 0 }}>
              <strong>Missed reason:</strong> {occurrence.missedReason}
            </p>
          ) : null}
        </div>

        {occurrence.notes.length ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Schedule Notes</h2>
            {occurrence.notes.map((n) => (
              <div key={n.id} style={{ marginBottom: 12 }}>
                <div>{n.note}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {n.createdBy.name ?? n.createdBy.email} ·{" "}
                  {fmt(n.createdAt, occurrence.timezone)}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 16 }}>
          {occurrence.tasks.map((task) => (
            <div className="card" key={task.id}>
              <h2 style={{ marginTop: 0 }}>
                {task.sequence}. {task.taskNameSnapshot}
              </h2>
              <div className="formGrid">
                <Fact label="Status" value={task.status.replaceAll("_", " ")} />
                <Fact
                  label="Planned"
                  value={`${task.plannedDurationMinutes} min`}
                />
                <Fact
                  label="Actual"
                  value={duration(task.actualDurationSeconds)}
                />
                <Fact
                  label="Started"
                  value={fmt(task.actualStartAt, occurrence.timezone)}
                />
                <Fact
                  label="Ended"
                  value={fmt(task.actualEndAt, occurrence.timezone)}
                />
                <Fact
                  label="Evidence"
                  value={
                    task.evidenceRequired
                      ? `${task.evidenceTypeRequired ?? "EITHER"} required`
                      : "Not required"
                  }
                />
              </div>

              {task.notes.length ? (
                <>
                  <h3>Task Notes</h3>
                  {task.notes.map((n) => (
                    <div key={n.id} style={{ marginBottom: 10 }}>
                      <div>{n.note}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {n.createdBy.name ?? n.createdBy.email} ·{" "}
                        {fmt(n.createdAt, occurrence.timezone)}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {task.evidence.length ? (
                <>
                  <h3>Evidence</h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(180px,1fr))",
                      gap: 12
                    }}
                  >
                    {task.evidence.map((e) => {
                      const url = signed.get(e.id);
                      return (
                        <div key={e.id}>
                          {url && e.type === "PHOTO" ? (
                            <img
                              src={url}
                              alt={`Evidence for ${task.taskNameSnapshot}`}
                              style={{
                                width: "100%",
                                maxHeight: 220,
                                objectFit: "cover",
                                borderRadius: 10
                              }}
                            />
                          ) : url && e.type === "VIDEO" ? (
                            <video
                              src={url}
                              controls
                              style={{ width: "100%", maxHeight: 240 }}
                            />
                          ) : (
                            <div className="muted">
                              Evidence preview temporarily unavailable.
                            </div>
                          )}
                          <div className="muted" style={{ fontSize: 12 }}>
                            {e.type} · {fmt(e.capturedAt, occurrence.timezone)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}
