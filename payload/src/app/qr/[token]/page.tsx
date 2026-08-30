import Link from "next/link";
import {notFound} from "next/navigation";
import {prisma} from "@/lib/prisma";

export const dynamic="force-dynamic";export const revalidate=0;
function dt(v:Date|null|undefined,tz:string){if(!v)return"—";return new Intl.DateTimeFormat("en-US",{timeZone:tz,dateStyle:"medium",timeStyle:"short"}).format(v)}
function dur(seconds:number|null|undefined){if(seconds==null)return"—";const total=Math.max(0,Math.round(seconds)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${h}h ${m}m`:m?`${m}m ${s}s`:`${s}s`}
function variance(actualSeconds:number|null|undefined,plannedMinutes:number){if(actualSeconds==null)return{seconds:null,pct:null};const planned=plannedMinutes*60,delta=actualSeconds-planned,pct=planned?delta/planned*100:null;return{seconds:delta,pct}}
function signedSeconds(s:number|null){if(s==null)return"—";const sign=s>0?"+":s<0?"−":"";return `${sign}${dur(Math.abs(s))}`}
function signedPct(p:number|null){if(p==null)return"—";return `${p>0?"+":""}${p.toFixed(1)}%`}
function displayName(user:{name:string|null}|null|undefined){return user?.name?.trim()||"Team member"}

async function getServices(organizationId:string,workAreaId:string){
 return prisma.scheduleOccurrence.findMany({where:{organizationId,workAreaId,status:{in:["COMPLETED","PARTIALLY_COMPLETED"]},completedAt:{not:null}},orderBy:{completedAt:"desc"},take:3,select:{id:true,scheduleNameSnapshot:true,status:true,scheduledStartAt:true,scheduledEndAt:true,completedAt:true,actualDurationSeconds:true,plannedDurationMinutes:true,assignedUser:{select:{name:true}},tasks:{orderBy:{sequence:"asc"},select:{id:true,sequence:true,taskNameSnapshot:true,plannedDurationMinutes:true,actualStartAt:true,actualEndAt:true,actualDurationSeconds:true,status:true,completedBy:{select:{name:true}}}}}})
}
type Service=Awaited<ReturnType<typeof getServices>>[number];

function ServiceDetail({service,timeZone,open=false}:{service:Service;timeZone:string;open?:boolean}){
 const sv=variance(service.actualDurationSeconds,service.plannedDurationMinutes);
 const names=Array.from(new Set(service.tasks.filter(t=>t.status==="COMPLETED").map(t=>displayName(t.completedBy??service.assignedUser))));
 return <details className="publicService" open={open}><summary><div><small>{open?"Latest completed service":"Previous service"}</small><strong>{service.scheduleNameSnapshot}</strong><span>{dt(service.completedAt,timeZone)}</span></div><b>{open?"Details":"View"}</b></summary><div className="publicServiceBody"><div className="publicServiceMeta"><div><small>Completed</small><strong>{dt(service.completedAt,timeZone)}</strong></div><div><small>Completed by</small><strong>{names.join(", ")||displayName(service.assignedUser)}</strong></div><div><small>Scheduled duration</small><strong>{dur(service.plannedDurationMinutes*60)}</strong></div><div><small>Actual duration</small><strong>{dur(service.actualDurationSeconds)}</strong></div><div><small>Variance</small><strong>{signedSeconds(sv.seconds)}</strong></div><div><small>% variance</small><strong>{signedPct(sv.pct)}</strong></div></div><div className="publicTaskTableWrap"><table className="publicTaskTable"><thead><tr><th>#</th><th>Task performed</th><th>Completed by</th><th>Start</th><th>End</th><th>Scheduled</th><th>Actual</th><th>Variance</th><th>% Var.</th></tr></thead><tbody>{service.tasks.map(t=>{const v=variance(t.actualDurationSeconds,t.plannedDurationMinutes);return <tr key={t.id}><td>{t.sequence}</td><td><strong>{t.taskNameSnapshot}</strong></td><td>{displayName(t.completedBy??service.assignedUser)}</td><td>{dt(t.actualStartAt,timeZone)}</td><td>{dt(t.actualEndAt,timeZone)}</td><td>{dur(t.plannedDurationMinutes*60)}</td><td>{dur(t.actualDurationSeconds)}</td><td>{signedSeconds(v.seconds)}</td><td>{signedPct(v.pct)}</td></tr>})}</tbody></table></div></div></details>
}

export default async function QrLanding({params}:{params:Promise<{token:string}>}){
 const{token}=await params;
 const qr=await prisma.qrCode.findUnique({where:{id:token},include:{workArea:{include:{property:{include:{organization:true}}}}}});
 if(!qr||qr.status!=="ACTIVE")notFound();
 const wa=qr.workArea,organizationId=wa.property.organizationId,timeZone=wa.property.timezone||wa.property.organization.timezone||"UTC";
 const[services,nextScheduled]=await Promise.all([getServices(organizationId,wa.id),prisma.scheduleOccurrence.findFirst({where:{organizationId,workAreaId:wa.id,status:"PENDING",scheduledStartAt:{gte:new Date()}},orderBy:{scheduledStartAt:"asc"},select:{scheduleNameSnapshot:true,scheduledStartAt:true}})]);
 return <main className="publicQrPage"><header className="publicQrHero"><div className="publicQrBrand"><span>eD</span><strong>Verified Service Status</strong></div><h1>{wa.name}</h1><p><strong>{wa.property.name}</strong>{wa.locationIdentifier?` · ${wa.locationIdentifier}`:""}</p>{wa.description&&<p className="muted">{wa.description}</p>}</header>
  <section className="publicQrStatus"><div><small>Current status</small><strong>{services[0]?"Latest service completed":"No completed service yet"}</strong></div><div><small>Next scheduled</small><strong>{nextScheduled?dt(nextScheduled.scheduledStartAt,timeZone):"No upcoming service"}</strong></div></section>
  {services[0]?<ServiceDetail service={services[0]} timeZone={timeZone} open/>:<div className="card">No completed service is recorded for this Work Area.</div>}
  {services.length>1&&<section className="previousServices"><h2>Previous service completions</h2><p>Previous two completion dates and times are shown below. Open either record for its full task breakdown.</p>{services.slice(1,3).map(s=><ServiceDetail key={s.id} service={s} timeZone={timeZone}/>)}</section>}
  <footer className="publicQrFooter"><span>Public operational service information only. Personal contact details, internal notes, evidence and audit data are not exposed.</span><Link href="/">eDekhbhal</Link></footer>
 </main>
}
