import Link from "next/link";
import {
  DEMO_WORKSPACE,
  demoProperties,
  demoSchedules,
  demoTasks,
  demoTeam,
  getDemoReport,
} from "@/lib/demoWorkspace";

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default async function DemoSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (section === "properties") {
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Demo master data</span><h1>Properties</h1><p>Four different operating environments under one reference Organization.</p></header>
        <div className="demoPropertyGrid">
          {demoProperties.map((p) => <article key={p.id}><span>{p.industry}</span><h3>{p.name}</h3><p>{p.description}</p><small>{p.workAreas.length} Work Areas</small></article>)}
        </div>
      </main>
    );
  }

  if (section === "work-areas") {
    const rows = demoProperties.flatMap((p) => p.workAreas.map((w) => ({ ...w, propertyName: p.name, industry: p.industry })));
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Demo master data</span><h1>Work Areas & QR</h1><p>Sample operational areas with web-only public demo QR experiences.</p></header>
        <div className="demoCardList">
          {rows.map((w) => <article key={w.id}><div><small>{w.industry} · {w.propertyName}</small><h3>{w.name}</h3><p>{w.description}</p></div><Link className="demoButton" href={`/demo-qr/${w.id}`} target="_blank">Open Demo QR</Link></article>)}
        </div>
      </main>
    );
  }

  if (section === "tasks") {
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Best-practice templates</span><h1>Tasks</h1><p>Reusable examples across Hospitality, Food Manufacturing, Maintenance and Corporate Office operations.</p></header>
        <div className="demoCardList">
          {demoTasks.map((task) => <article key={task.id}><div><small>{task.category} · Evidence example: {task.evidence}</small><h3>{task.name}</h3><p>{task.description}</p></div><Link className="demoButton" href={`/tasks/new?demoTask=${encodeURIComponent(task.id)}`}>Use this Task as a template</Link></article>)}
        </div>
        <p className="demoNote">The template action opens the normal real-workspace Add Task screen with the selected Task prefilled. Nothing is written until the authorized user saves it.</p>
      </main>
    );
  }

  if (section === "schedules") {
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Reference scheduling</span><h1>Schedules</h1><p>Includes production lots, hospitality routines, preventive maintenance and breakdown response. Demo Schedules are read-only and are not copied to real workspaces.</p></header>
        <div className="demoCardList">
          {demoSchedules.map((schedule) => {
            const property = demoProperties.find((p) => p.id === schedule.propertyId)!;
            const workArea = property.workAreas.find((w) => w.id === schedule.workAreaId)!;
            return <article key={schedule.id}><div><small>{property.name} · {workArea.name}</small><h3>{schedule.name}</h3><p>{schedule.purpose}</p><p><strong>{schedule.cadence}</strong> · {schedule.taskIds.length} Task{schedule.taskIds.length === 1 ? "" : "s"}</p></div><span className="demoReadOnlyBadge">Read-only</span></article>;
          })}
        </div>
      </main>
    );
  }

  if (section === "team") {
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Reference staffing</span><h1>Team</h1><p>Sample Admin, Property Manager and User assignments across industries.</p></header>
        <div className="demoCardList">
          {demoTeam.map((m) => <article key={m.id}><div><small>{statusLabel(m.role)}</small><h3>{m.name}</h3><p>{m.title}</p></div><span>{m.assignedPropertyIds.length} assigned Propert{m.assignedPropertyIds.length === 1 ? "y" : "ies"}</span></article>)}
        </div>
      </main>
    );
  }

  if (section === "organization") {
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Reference configuration</span><h1>{DEMO_WORKSPACE.displayName}</h1><p>This is a logical demo workspace, not a tenant Organization row.</p></header>
        <section className="demoPanel"><h2>Configuration principles</h2><ul className="demoPrinciples"><li>One universal demo for every customer organization.</li><li>Read-only master data and deterministic synthetic activity.</li><li>No synthetic ScheduleOccurrence, AuditLog, evidence or Report rows written to PostgreSQL.</li><li>Public web-only demo QR pages.</li><li>Role simulator is educational and never modifies real permissions.</li></ul></section>
      </main>
    );
  }

  if (section === "reports") {
    const report = getDemoReport(30);
    return (
      <main className="container demoPage">
        <header className="demoPageHeader"><span className="eyebrow">Synthetic operational reporting</span><h1>Demo Reports — Last 30 Days</h1><p>Generated deterministically from the same synthetic activity engine used by the Demo Dashboard, including realistic late, missed and incomplete work.</p></header>
        <section className="demoMetricGrid">
          <article><span>Schedule performance</span><strong>{report.performancePct}%</strong></article>
          <article><span>On-time completion</span><strong>{report.onTimePct}%</strong></article>
          <article><span>Late</span><strong>{report.aggregate.late}</strong></article>
          <article><span>Missed</span><strong>{report.aggregate.missed}</strong></article>
          <article><span>Incomplete</span><strong>{report.aggregate.incomplete}</strong></article>
          <article><span>Total sampled events</span><strong>{report.aggregate.total}</strong></article>
        </section>
        <section className="demoPanel">
          <div className="demoSectionHeading"><div><span className="eyebrow">Real-life exceptions</span><h2>Recent exception samples</h2></div></div>
          <div className="demoTableWrap">
            <table className="demoTable">
              <thead><tr><th>Date</th><th>Schedule</th><th>Property</th><th>Status</th><th>Exception</th></tr></thead>
              <tbody>{report.exceptions.map((e) => <tr key={e.id}><td>{e.dateKey}</td><td>{e.scheduleName}</td><td>{e.propertyName}</td><td>{statusLabel(e.status)}</td><td>{e.exception}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="demoPanel">
          <div className="demoSectionHeading"><div><span className="eyebrow">Daily trend</span><h2>Recent 14 days</h2></div></div>
          <div className="demoTableWrap">
            <table className="demoTable">
              <thead><tr><th>Date</th><th>Total</th><th>Completed</th><th>On Time</th><th>Late</th><th>Missed</th><th>Incomplete</th></tr></thead>
              <tbody>{report.daily.slice(-14).reverse().map((d) => <tr key={d.dateKey}><td>{d.dateKey}</td><td>{d.total}</td><td>{d.completed}</td><td>{d.onTime}</td><td>{d.late}</td><td>{d.missed}</td><td>{d.incomplete}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </main>
    );
  }

  return <main className="container demoPage"><header className="demoPageHeader"><h1>Demo section not found</h1><Link href="/demo/dashboard">Return to Demo Dashboard</Link></header></main>;
}
