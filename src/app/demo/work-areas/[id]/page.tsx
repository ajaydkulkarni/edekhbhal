import Link from "next/link";
import { notFound } from "next/navigation";
import { findDemoWorkArea, getDemoEventsForDate } from "@/lib/demoWorkspace";

export default async function DemoWorkAreaDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const found=findDemoWorkArea(id);
  if(!found) notFound();
  const {property,workArea}=found;
  const today=new Date();
  const history = [-3,-2,-1,0].flatMap((offset)=>{
    const d=new Date(today.getTime()+offset*86400000);
    return getDemoEventsForDate(d).filter((e)=>e.workAreaId===workArea.id);
  }).reverse();

  return <main className="container">
    <div className="breadcrumbs"><Link href="/demo/work-areas">Work Areas</Link> / {workArea.name}</div>
    <div className="row"><div style={{marginRight:"auto"}}><h1>{workArea.name}</h1><p className="muted">{property.name} · {workArea.locationIdentifier}</p></div><span className="demoReadOnlyBadge">Read-only</span></div>

    <div className="card"><div className="row" style={{alignItems:"flex-start",gap:24,flexWrap:"wrap"}}>
      <div style={{flex:"1 1 340px"}}><h2 style={{marginTop:0}}>Service Status</h2><p>{workArea.description}</p><p><strong>Status:</strong> {workArea.status}</p><p><strong>Parent Property:</strong> <Link href={`/demo/properties/${property.id}`}>{property.name}</Link></p><p className="muted">The real workspace uses the same Work Area concept with a database-backed active QR and service history.</p></div>
      <div><Link className="button secondary" href={`/demo-qr/${workArea.id}`} target="_blank">Open Demo Public QR</Link></div>
    </div></div>

    <div className="card" style={{marginTop:20}}><h2>Recent Service History</h2><table className="table"><thead><tr><th>Date</th><th>Schedule</th><th>User</th><th>Status</th><th>Planned</th><th>Actual</th><th>Exception</th></tr></thead><tbody>
      {history.map((e)=><tr key={e.id}><td>{e.dateKey}</td><td><Link href={`/demo/schedules/${e.scheduleId}`}>{e.scheduleName}</Link></td><td>{e.assignee}</td><td>{e.status.replaceAll("_"," ")}</td><td>{e.plannedMinutes} min</td><td>{e.actualMinutes==null?"—":`${e.actualMinutes} min`}</td><td>{e.exception??"—"}</td></tr>)}
      {!history.length&&<tr><td colSpan={7} className="muted">No recent synthetic activity for this Work Area.</td></tr>}
    </tbody></table></div>
  </main>;
}
