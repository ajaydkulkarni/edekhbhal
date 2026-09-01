import Link from "next/link";
import {
  DEMO_WORKSPACE,
  demoProperties,
  getDemoDashboard,
} from "@/lib/demoWorkspace";

function label(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function DemoDashboardPage() {
  const dashboard = getDemoDashboard();

  return (
    <main className="container demoPage">
      <section className="demoHero">
        <div>
          <span className="eyebrow">Best-practice reference workspace</span>
          <h1>{DEMO_WORKSPACE.displayName}</h1>
          <p>
            Explore realistic Hospitality, Food Manufacturing, Maintenance and
            Corporate Office operations. All activity below is synthetic and
            refreshed relative to the current date.
          </p>
        </div>
        <div className="demoReadOnlyBadge">Read-only</div>
      </section>

      <section className="demoMetricGrid">
        <article><span>Scheduled today</span><strong>{dashboard.counts.total}</strong></article>
        <article><span>Completed</span><strong>{dashboard.counts.completed}</strong></article>
        <article><span>On time</span><strong>{dashboard.counts.onTime}</strong></article>
        <article><span>Late</span><strong>{dashboard.counts.late}</strong></article>
        <article><span>In progress</span><strong>{dashboard.counts.inProgress}</strong></article>
        <article><span>Missed / incomplete</span><strong>{dashboard.counts.missed + dashboard.counts.incomplete}</strong></article>
      </section>

      <section className="demoPanel">
        <div className="demoSectionHeading">
          <div>
            <span className="eyebrow">Live sample activity</span>
            <h2>Today — {dashboard.dateKey}</h2>
          </div>
          <Link href="/demo/reports">Open Demo Reports →</Link>
        </div>
        <div className="demoTableWrap">
          <table className="demoTable">
            <thead><tr><th>Schedule</th><th>Property</th><th>Work Area</th><th>Assignee</th><th>Status</th><th>Exception</th></tr></thead>
            <tbody>
              {dashboard.events.map((event) => (
                <tr key={event.id}>
                  <td><strong>{event.scheduleName}</strong></td>
                  <td>{event.propertyName}</td>
                  <td>{event.workAreaName}</td>
                  <td>{event.assignee}</td>
                  <td><span className={`demoStatus demoStatus-${event.status.toLowerCase()}`}>{label(event.status)}</span></td>
                  <td>{event.exception ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="demoPanel">
        <div className="demoSectionHeading">
          <div><span className="eyebrow">Reference organization</span><h2>Industry examples</h2></div>
        </div>
        <div className="demoPropertyGrid">
          {demoProperties.map((property) => (
            <article key={property.id}>
              <span>{property.industry}</span>
              <h3>{property.name}</h3>
              <p>{property.description}</p>
              <small>{property.workAreas.length} Work Areas</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
