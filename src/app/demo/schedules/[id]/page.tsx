import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findDemoProperty,
  findDemoSchedule,
  findDemoWorkArea,
  getDemoScheduleOccurrences,
  getDemoScheduleRows,
  getDemoScheduleTotalMinutes,
  minutesToDemoDuration,
} from "@/lib/demoWorkspace";

function offsetLabel(minutes:number) {
  const base = 8*60 + minutes;
  const h = Math.floor(base/60)%24;
  const m = base%60;
  return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`;
}

export default async function DemoScheduleDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const schedule=findDemoSchedule(id);
  if(!schedule) notFound();
  const property=findDemoProperty(schedule.propertyId)!;
  const waFound=findDemoWorkArea(schedule.workAreaId)!;
  const rows=getDemoScheduleRows(schedule.id);
  const occurrences=getDemoScheduleOccurrences(schedule.id);
  const total=getDemoScheduleTotalMinutes(schedule.id);

  return <main className="container">
    <div className="breadcrumbs"><Link href="/demo/schedules">Schedules</Link> / {schedule.name}</div>
    <div className="row"><div style={{marginRight:"auto"}}><h1>{schedule.name}</h1><p className="muted">{waFound.workArea.name} — {property.name} · {schedule.status}</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
    <p className="muted">{schedule.purpose}</p>

    <div className="card" style={{marginBottom:20}}>
      <div className="row" style={{alignItems:"flex-start",gap:24,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 320px"}}><h2 style={{marginTop:0}}>Work Area QR Code</h2><p><strong>{waFound.workArea.name}</strong> — {property.name}</p><p className="muted">Demo equivalent of the latest active Work Area QR displayed on a real Schedule.</p><Link className="button secondary" href={`/demo-qr/${waFound.workArea.id}`} target="_blank">Open public Demo QR page</Link></div>
        <div className="demoQrPlaceholder"><strong>DEMO QR</strong><span>{waFound.workArea.name}</span></div>
      </div>
    </div>

    <div className="card">
      <div className="row"><div style={{marginRight:"auto"}}><h2 style={{marginBottom:4}}>Schedule Definition</h2><p className="muted">Presented in the same concepts as the real Schedule editor, without write controls.</p></div><span className="statusPill active">{schedule.status}</span></div>
      <div className="formGrid">
        <label>Schedule Name<input value={schedule.name} readOnly/></label>
        <label>Schedule Frequency<input value={schedule.frequencyType} readOnly/></label>
        <label>Recurrence / Timing<input value={schedule.cadence} readOnly/></label>
        <label>Timezone<input value={schedule.timezone} readOnly/></label>
        <label>Work Area<input value={`${waFound.workArea.name} — ${property.name}`} readOnly/></label>
        <label>Total Planned Duration<input value={minutesToDemoDuration(total)} readOnly/></label>
      </div>

      <h3>Ordered Tasks</h3>
      <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Seq.</th><th>Task</th><th>Planned Start</th><th>Planned End</th><th>Duration</th><th>Evidence Rule</th><th></th></tr></thead><tbody>
        {rows.map((row)=><tr key={row.task.id}><td>{row.sequence}</td><td><strong>{row.task.name}</strong></td><td>{offsetLabel(row.startOffsetMinutes)}</td><td>{offsetLabel(row.endOffsetMinutes)}</td><td>{minutesToDemoDuration(row.durationMinutes)}</td><td>{row.task.evidence}</td><td><Link href={`/demo/tasks/${row.task.id}`}>View Task</Link></td></tr>)}
      </tbody></table></div>
    </div>

    <div style={{marginTop:32}}><h2>Generated / Recent Occurrences</h2><p className="muted">Synthetic occurrence rows demonstrate the execution records used by mobile and management reporting.</p></div>
    <div className="card"><table className="table"><thead><tr><th>Date</th><th>Planned Duration</th><th>Actual Duration</th><th>User</th><th>Status</th><th>Exception</th></tr></thead><tbody>
      {occurrences.map((o)=><tr key={o.id}><td>{o.dateKey}</td><td>{o.plannedMinutes} min</td><td>{o.actualMinutes==null?"—":`${o.actualMinutes} min`}</td><td>{o.assignee}</td><td>{o.status.replaceAll("_"," ")}</td><td>{o.exception??"—"}</td></tr>)}
    </tbody></table></div>
  </main>;
}
