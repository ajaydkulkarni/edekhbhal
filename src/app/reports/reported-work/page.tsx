import Link from "next/link";
import {redirect} from "next/navigation";
import {Nav} from "@/components/Nav";
import {ReportedWorkActions} from "@/components/ReportedWorkActions";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {assignedPropertyIds} from "@/lib/propertyAccess";

function validDate(v:string|undefined){return v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:"";}

export default async function ReportedWorkPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const user=await getSessionUser();if(!user)redirect("/login");
 const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});
 if(!membership)redirect("/onboarding");if(!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))redirect("/dashboard");
 const q=await searchParams,scopeIds=await assignedPropertyIds(membership);
 const propertyId=(q.propertyId||"").trim(),workAreaId=(q.workAreaId||"").trim(),reporterId=(q.reporterId||"").trim(),status=(q.status||"").trim(),noteScope=(q.noteScope||"").trim(),search=(q.search||"").trim().toLowerCase(),dateFrom=validDate(q.dateFrom),dateTo=validDate(q.dateTo);
 const properties=await prisma.property.findMany({where:{organizationId:membership.organizationId,...(scopeIds?{id:{in:scopeIds}}:{})},orderBy:{name:"asc"}});
 const propertyIds=properties.map(p=>p.id);
 const workAreas=await prisma.workArea.findMany({where:{propertyId:{in:propertyId?[propertyId]:propertyIds}},include:{property:true},orderBy:[{property:{name:"asc"}},{name:"asc"}]});
 const reporters=await prisma.user.findMany({where:{memberships:{some:{organizationId:membership.organizationId,...(scopeIds?{propertyAssignments:{some:{propertyId:{in:scopeIds}}}}:{})}}},orderBy:[{name:"asc"},{email:"asc"}]});
 const reportedAt:any={};if(dateFrom)reportedAt.gte=new Date(`${dateFrom}T00:00:00.000Z`);if(dateTo)reportedAt.lte=new Date(`${dateTo}T23:59:59.999Z`);
 const rows=await prisma.reportedWorkItem.findMany({where:{organizationId:membership.organizationId,propertyId:{in:propertyIds},...(propertyId?{propertyId}:{}),...(workAreaId?{workAreaId}:{}),...(reporterId?{reportedById:reporterId}:{}),...(status?{status:status as any}:{}),...(noteScope?{noteScope:noteScope as any}:{}),...(dateFrom||dateTo?{reportedAt}:{})},include:{property:true,workArea:true,reportedBy:true,dismissedBy:true,linkedSchedule:true,scheduleLinkedBy:true},orderBy:{reportedAt:"desc"},take:5000});
 const filtered=search?rows.filter(r=>[r.noteText,r.sourceTaskName,r.sourceScheduleName,r.property.name,r.workArea.name,r.reportedBy.name,r.reportedBy.email].filter(Boolean).join(" ").toLowerCase().includes(search)):rows;
 return <><Nav/><main className="container">
  <div className="row"><div style={{marginRight:"auto"}}><h1>Reported Notes / Work Requests</h1><p className="muted">Frontline Task and Schedule notes with supervisory action and resulting Schedule.</p></div><Link className="button secondary" href="/reports">Back to Reports</Link></div>
  <form className="card" style={{margin:"18px 0"}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
   <label>Search<input name="search" defaultValue={q.search||""} placeholder="Note, task, work area, reporter..."/></label>
   <label>Property<select name="propertyId" defaultValue={propertyId}><option value="">All Properties</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>Work Area<select name="workAreaId" defaultValue={workAreaId}><option value="">All Work Areas</option>{workAreas.map(w=><option key={w.id} value={w.id}>{w.name} — {w.property.name}</option>)}</select></label>
   <label>Reporter<select name="reporterId" defaultValue={reporterId}><option value="">All Reporters</option>{reporters.map(r=><option key={r.id} value={r.id}>{r.name||r.email}</option>)}</select></label>
   <label>Status<select name="status" defaultValue={status}><option value="">All Statuses</option><option value="NEW">New</option><option value="DISMISSED">Dismissed</option><option value="SCHEDULE_CREATED">Schedule Created</option></select></label>
   <label>Note Type<select name="noteScope" defaultValue={noteScope}><option value="">All Types</option><option value="TASK">Task Note</option><option value="SCHEDULE">Schedule Note</option></select></label>
   <label>From<input name="dateFrom" type="date" defaultValue={dateFrom}/></label><label>To<input name="dateTo" type="date" defaultValue={dateTo}/></label>
  </div><div className="row" style={{marginTop:12}}><button className="button">Apply Filters</button><Link className="button secondary" href="/reports/reported-work">Clear / Reset</Link></div></form>
  <p className="muted">{filtered.length} reported item{filtered.length===1?"":"s"} shown.</p>
  <div className="card" style={{overflowX:"auto"}}><table className="table reportedWorkTable"><thead><tr><th>Reported</th><th>Reported By</th><th>Property / Work Area</th><th>Type / Context</th><th>Note</th><th>Status / History</th><th>Action</th></tr></thead><tbody>
  {filtered.map(r=><tr key={r.id}><td>{r.reportedAt.toLocaleString()}</td><td><strong>{r.reportedBy.name||r.reportedBy.email}</strong><small className="tableSubtext">{r.reportedBy.email}</small></td><td><strong>{r.property.name}</strong><small className="tableSubtext">{r.workArea.name}</small></td><td><strong>{r.noteScope==="TASK"?"Task Note":"Schedule Note"}</strong>{r.sourceTaskName&&<small className="tableSubtext">Task: {r.sourceTaskName}</small>}{r.sourceScheduleName&&<small className="tableSubtext">Schedule: {r.sourceScheduleName}</small>}</td><td style={{minWidth:260,whiteSpace:"pre-wrap"}}>{r.noteText}</td><td style={{minWidth:220}}><strong>{r.status.replaceAll("_"," ")}</strong>{r.dismissedAt&&<small className="tableSubtext">Dismissed {r.dismissedAt.toLocaleString()} by {r.dismissedBy?.name||r.dismissedBy?.email||"System"}</small>}{r.linkedSchedule&&<small className="tableSubtext">Schedule: {r.linkedSchedule.name}</small>}{r.scheduleLinkedAt&&<small className="tableSubtext">Created {r.scheduleLinkedAt.toLocaleString()} by {r.scheduleLinkedBy?.name||r.scheduleLinkedBy?.email||"System"}</small>}</td><td><ReportedWorkActions id={r.id} workAreaId={r.workAreaId} status={r.status} linkedScheduleId={r.linkedScheduleId}/></td></tr>)}
  {!filtered.length&&<tr><td colSpan={7} className="muted">No reported work items match these filters.</td></tr>}
  </tbody></table></div>
 </main></>;
}
