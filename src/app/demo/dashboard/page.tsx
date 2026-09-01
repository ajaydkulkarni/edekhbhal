import Link from "next/link";
import { DEMO_WORKSPACE, getDemoDashboard } from "@/lib/demoWorkspace";
import { getDemoViewRole } from "@/lib/demoRole";

function label(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default async function DemoDashboardPage() {
  const role = await getDemoViewRole();
  const dashboard = getDemoDashboard(new Date(), role);

  return (
    <main className="container dashboardPage">
      <div className="dashboardHero">
        <div>
          <span className="eyebrow">{role === "USER" ? "Field-user sample workspace" : "Operations command center"}</span>
          <h1>{DEMO_WORKSPACE.displayName}</h1>
          <p className="muted">
            {role === "ADMIN"
              ? "Organization-wide synthetic operations using the same management concepts as the real workspace."
              : role === "PROPERTY_MANAGER"
              ? "Assigned-Property perspective for FreshBite Foods Manufacturing Plant."
              : "Sample assigned work and read-only operational context for a field User."}
          </p>
        </div>
        <div className="dashboardIdentity">
          <span>Demo perspective</span>
          <strong>{role === "ADMIN" ? "Admin" : role === "PROPERTY_MANAGER" ? "Property Manager" : "User"}</strong>
        </div>
      </div>

      <div className="demoMetricGrid">
        <article><span>Scheduled today</span><strong>{dashboard.counts.total}</strong></article>
        <article><span>Completed</span><strong>{dashboard.counts.completed}</strong></article>
        <article><span>On time</span><strong>{dashboard.counts.onTime}</strong></article>
        <article><span>In progress</span><strong>{dashboard.counts.inProgress}</strong></article>
        <article><span>Exceptions</span><strong>{dashboard.exceptions.length}</strong></article>
        <article><span>Missed / incomplete</span><strong>{dashboard.counts.missed + dashboard.counts.incomplete}</strong></article>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row">
          <div style={{ marginRight: "auto" }}>
            <span className="eyebrow">Today&apos;s Schedule Progress</span>
            <h2 style={{ marginBottom: 4 }}>{dashboard.dateKey}</h2>
          </div>
          <Link className="button small secondary" href="/demo/reports">Open Reports</Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Schedule</th><th>Property</th><th>Work Area</th><th>User</th><th>Status</th><th>Exception</th><th></th></tr></thead>
            <tbody>
              {dashboard.events.map((event) => (
                <tr key={event.id}>
                  <td><strong>{event.scheduleName}</strong></td>
                  <td>{event.propertyName}</td>
                  <td>{event.workAreaName}</td>
                  <td>{event.assignee}</td>
                  <td>{label(event.status)}</td>
                  <td>{event.exception ?? "—"}</td>
                  <td><Link href={`/demo/schedules/${event.scheduleId}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {role !== "USER" && (
        <div className="card">
          <div className="row">
            <div style={{ marginRight: "auto" }}>
              <span className="eyebrow">Attention Required</span>
              <h2 style={{ marginBottom: 4 }}>Operational exceptions</h2>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Property</th><th>Schedule</th><th>Issue</th><th></th></tr></thead>
            <tbody>
              {dashboard.exceptions.slice(0, 6).map((event) => (
                <tr key={event.id}>
                  <td>{event.propertyName}</td>
                  <td>{event.scheduleName}</td>
                  <td>{event.exception}</td>
                  <td><Link href={`/demo/schedules/${event.scheduleId}`}>Review</Link></td>
                </tr>
              ))}
              {!dashboard.exceptions.length && <tr><td colSpan={4} className="muted">No current exceptions.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
