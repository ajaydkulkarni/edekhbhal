import Link from "next/link";
import {
  DEMO_WORKSPACE,
  demoTeam,
  demoTaskUsageCount,
  getDemoReport,
  getDemoScheduleTotalMinutes,
  minutesToDemoDuration,
  visibleDemoProperties,
  visibleDemoSchedules,
  visibleDemoTasks,
} from "@/lib/demoWorkspace";
import { getDemoViewRole } from "@/lib/demoRole";
import { getDemoDocumentControl } from "@/lib/demoDocumentControl";

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default async function DemoSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const role = await getDemoViewRole();
  const properties = visibleDemoProperties(role);
  const schedules = visibleDemoSchedules(role);
  const tasks = visibleDemoTasks(role);

  if (section === "properties") {
    return <main className="container">
      <div className="row"><div style={{marginRight:"auto"}}><h1>Properties</h1><p className="muted">{DEMO_WORKSPACE.displayName}</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
      <div className="card" style={{overflowX:"auto"}}><table className="table">
        <thead><tr><th>Name</th><th>City</th><th>Status</th><th>Work Areas</th><th>Industry</th><th></th></tr></thead>
        <tbody>{properties.map((p)=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.city}</td><td>{p.status}</td><td>{p.workAreas.length}</td><td>{p.industry}</td><td><Link className="button small secondary" href={`/demo/properties/${p.id}`}>Open</Link></td></tr>)}</tbody>
      </table></div>
    </main>;
  }

  if (section === "work-areas") {
    const rows = properties.flatMap((p)=>p.workAreas.map((w)=>({...w,propertyName:p.name})));
    return <main className="container">
      <div className="row"><div style={{marginRight:"auto"}}><h1>Work Areas</h1><p className="muted">Parent Property, Service Status and Demo QR follow the real workspace pattern.</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
      <div className="card" style={{overflowX:"auto"}}><table className="table">
        <thead><tr><th>Work Area</th><th>Parent Property</th><th>Location</th><th>Status</th><th>Service Status</th><th>Public QR</th></tr></thead>
        <tbody>{rows.map((w)=><tr key={w.id}><td><strong>{w.name}</strong></td><td>{w.propertyName}</td><td>{w.locationIdentifier}</td><td>{w.status}</td><td><Link href={`/demo/work-areas/${w.id}`}>View</Link></td><td><Link href={`/demo-qr/${w.id}`} target="_blank">Open</Link></td></tr>)}</tbody>
      </table></div>
    </main>;
  }

  if (section === "tasks") {
    return <main className="container nextPage">
      <div className="pageIntro row"><div style={{marginRight:"auto"}}><span className="eyebrow">Reusable definitions</span><h1>Task Library</h1><p className="muted">Open any Task to see how it is defined, then optionally use it as a template in your real Organization.</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
      <div className="card"><table className="table">
        <thead><tr><th>Task</th><th>Description</th><th>Used in schedules</th><th>Attachments</th><th>Status</th><th></th></tr></thead>
        <tbody>{tasks.map((task)=><tr key={task.id}><td><strong>{task.name}</strong></td><td>{task.description.length>120?`${task.description.slice(0,120)}…`:task.description}</td><td>{demoTaskUsageCount(task.id)}</td><td>{task.attachmentCount}</td><td>{task.status}</td><td><Link className="button small secondary" href={`/demo/tasks/${task.id}`}>View</Link></td></tr>)}</tbody>
      </table></div>
    </main>;
  }

  if (section === "schedules") {
    return <main className="container">
      <div className="row"><div style={{marginRight:"auto"}}><h1>Schedules</h1><p className="muted">Open a Schedule to inspect Work Area, cadence, ordered Tasks, planned duration, evidence rules and synthetic occurrences.</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
      <div className="card"><table className="table">
        <thead><tr><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Frequency</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>
        <tbody>{schedules.map((schedule)=>{
          const property=properties.find((p)=>p.id===schedule.propertyId)!;
          const workArea=property.workAreas.find((w)=>w.id===schedule.workAreaId)!;
          const document=getDemoDocumentControl(schedule.id); return <tr key={schedule.id}><td><strong>{schedule.name}</strong></td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{schedule.cadence}</td><td><strong>{workArea.name}</strong><br/><span className="muted">{property.name}</span></td><td>{schedule.taskIds.length}</td><td>{minutesToDemoDuration(getDemoScheduleTotalMinutes(schedule.id))}</td><td>{schedule.status}</td><td><Link className="button small secondary" href={`/demo/schedules/${schedule.id}`}>View</Link></td></tr>;
        })}</tbody>
      </table></div>
    </main>;
  }

  if (section === "team") {
    const allowedPropertyIds = new Set(properties.map((p)=>p.id));
    const members = role==="ADMIN" ? demoTeam : demoTeam.filter((m)=>m.assignedPropertyIds.some((id)=>allowedPropertyIds.has(id)));
    return <main className="container"><div className="row"><div style={{marginRight:"auto"}}><h1>Team</h1><p className="muted">Sample personnel and assignment perspective.</p></div><span className="demoReadOnlyBadge">Read-only</span></div><div className="card"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Title</th><th>Assigned Properties</th></tr></thead><tbody>{members.map((m)=><tr key={m.id}><td><strong>{m.name}</strong></td><td>{statusLabel(m.role)}</td><td>{m.title}</td><td>{m.assignedPropertyIds.length}</td></tr>)}</tbody></table></div></main>;
  }

  if (section === "organization") {
    return <main className="container"><div className="row"><div style={{marginRight:"auto"}}><h1>{DEMO_WORKSPACE.displayName}</h1><p className="muted">Reference Organization configuration — logical Demo workspace, not a tenant row.</p></div><span className="demoReadOnlyBadge">Read-only</span></div><div className="card"><h2>Organization Settings</h2><p><strong>Timezone:</strong> {DEMO_WORKSPACE.timezone}</p><p><strong>Operating model:</strong> Multi-industry best-practice reference</p><p><strong>Working hours:</strong> Demonstrates inherited and operationally appropriate schedules</p><p className="muted">Demo never writes Organization settings to PostgreSQL.</p></div></main>;
  }

  if (section === "reports") {
    const report = getDemoReport(30, new Date(), role);
    return <main className="container">
      <div className="row"><div style={{marginRight:"auto"}}><span className="eyebrow">Synthetic operational reporting</span><h1>Demo Reports — Last 30 Days</h1><p className="muted">Same operational concepts as real reporting, backed by deterministic sample activity.</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
      <div className="demoMetricGrid"><article><span>Schedule performance</span><strong>{report.performancePct}%</strong></article><article><span>On-time completion</span><strong>{report.onTimePct}%</strong></article><article><span>Late</span><strong>{report.aggregate.late}</strong></article><article><span>Missed</span><strong>{report.aggregate.missed}</strong></article><article><span>Incomplete</span><strong>{report.aggregate.incomplete}</strong></article><article><span>Total sampled events</span><strong>{report.aggregate.total}</strong></article></div>
      <div className="card"><h2>Recent exception samples</h2><table className="table"><thead><tr><th>Date</th><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Property</th><th>Status</th><th>Exception</th><th></th></tr></thead><tbody>{report.exceptions.map((e)=>{const document=getDemoDocumentControl(e.scheduleId);return <tr key={e.id}><td>{e.dateKey}</td><td>{e.scheduleName}</td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{e.propertyName}</td><td>{statusLabel(e.status)}</td><td>{e.exception}</td><td><Link href={`/demo/schedules/${e.scheduleId}`}>Open</Link></td></tr>})}</tbody></table></div>
      <div className="card" style={{marginTop:20}}><h2>Recent 14 days</h2><table className="table"><thead><tr><th>Date</th><th>Total</th><th>Completed</th><th>On Time</th><th>Late</th><th>Missed</th><th>Incomplete</th></tr></thead><tbody>{report.daily.slice(-14).reverse().map((d)=><tr key={d.dateKey}><td>{d.dateKey}</td><td>{d.total}</td><td>{d.completed}</td><td>{d.onTime}</td><td>{d.late}</td><td>{d.missed}</td><td>{d.incomplete}</td></tr>)}</tbody></table></div>
    </main>;
  }

  return <main className="container"><h1>Demo section not found</h1><Link href="/demo/dashboard">Return to Demo Dashboard</Link></main>;
}
