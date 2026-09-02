import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { recurrenceLabel, formatInZone, minutesToDuration } from "@/lib/schedule";

export default async function SchedulesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });
  if (!membership) redirect("/onboarding");

  const schedules = await prisma.schedule.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      workArea: { include: { property: true } },
      scheduleTasks: { orderBy: { sequence: "asc" } }
    },
    orderBy: [{ status: "asc" }, { startAt: "asc" }, { name: "asc" }]
  });
  const canManage = ["ADMIN", "PROPERTY_MANAGER"].includes(membership.role);

  return <><Nav/><main className="container">
    <div className="row">
      <div style={{ marginRight: "auto" }}>
        <h1>Schedules</h1>
        <p className="muted">Plan recurring or one-time work for individual Work Areas, with optional controlled-document reference and revision.</p>
      </div>
      {canManage && <Link className="button" href="/schedules/new">Add Schedule</Link>}
    </div>
    <div className="card">
      <table className="table">
        <thead><tr><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Frequency</th><th>Starts</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {schedules.map((schedule) => {
            const total = schedule.scheduleTasks.reduce((sum, item) => sum + item.durationMinutes, 0);
            return <tr key={schedule.id}>
              <td style={{ maxWidth: 300 }}><strong>{schedule.name}</strong></td>
              <td>{schedule.documentReference ?? "—"}</td>
              <td>{schedule.documentRevision ?? "—"}</td>
              <td>{recurrenceLabel(schedule as any)}{schedule.frequencyType === "RECURRING" && <><br/><span className="muted">Ends: {schedule.endDate ? schedule.endDate.toISOString().slice(0,10) : "No end date"}</span></>}</td>
              <td>{formatInZone(schedule.startAt, schedule.timezone)}<br/><span className="muted">{schedule.timezone}</span></td>
              <td><strong>{schedule.workArea.name}</strong><br/><span className="muted">{schedule.workArea.property.name}</span></td>
              <td>{schedule.scheduleTasks.length}</td>
              <td>{minutesToDuration(total)}</td>
              <td>{schedule.status}</td>
              <td><Link className="button small secondary" href={`/schedules/${schedule.id}`}>{canManage ? "View / Edit" : "View"}</Link></td>
            </tr>;
          })}
          {!schedules.length && <tr><td colSpan={10} className="muted">No Schedules have been created yet.</td></tr>}
        </tbody>
      </table>
    </div>
  </main></>;
}
