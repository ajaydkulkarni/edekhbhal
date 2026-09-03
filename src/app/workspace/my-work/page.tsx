import Link from "next/link";
import {redirect} from "next/navigation";
import {randomUUID} from "node:crypto";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot,onboardingPath} from "@/lib/onboarding/server";
import {claimOccurrence,startOccurrence} from "@/lib/work-execution/actions";
import {listMyWork} from "@/lib/work-execution/server";

export default async function MyWorkPage({searchParams}:{searchParams:Promise<{message?:string;error?:string}>}){
 const user=await requireAuthenticatedUser(),snapshot=await getOnboardingSnapshot(user.id);
 if(!snapshot||snapshot.onboarding_state!=="ONBOARDING_COMPLETE")redirect(onboardingPath(snapshot?.onboarding_state??"REGISTERED"));
 if(!snapshot.app_user_id||!snapshot.organization_id||!snapshot.membership_id)redirect("/workspace");
 const params=await searchParams;
 const context={userId:snapshot.app_user_id,organizationId:snapshot.organization_id,membershipId:snapshot.membership_id};
 const work=snapshot.role_code==="USER"?await listMyWork(context):[];

 return <main className="workspacePage">
  <header className="workspaceHeader"><div><span className="eyebrow">FIELD EXECUTION</span><h1>My Work</h1><p>{snapshot.organization_name} · server-ranked eligible work</p></div><Link className="button secondaryButton" href="/workspace">Workspace</Link></header>
  {params.message?<section className="workspacePanel"><strong>{params.message}</strong></section>:null}
  {params.error?<section className="workspacePanel"><strong>Operation blocked</strong><p>{params.error}</p></section>:null}
  {snapshot.role_code!=="USER"?<section className="workspacePanel"><h2>USER execution role required</h2><p className="muted">ADMIN and SITE_MANAGER retain planning/management surfaces. My Work claim/start is intentionally a USER command boundary.</p></section>:
  <>
   <section className="workspacePanel"><span className="eyebrow">EXECUTION FOUNDATION 01</span><h2>Claim → Work Area QR → server-authoritative start</h2><p className="muted">Open eligible work may be claimed without manager approval. One Organization Membership can hold only one actively claimed/in-progress occurrence. QR validates the Work Area; it never grants authorization.</p></section>
   {work.length===0?<section className="workspacePanel"><h2>No eligible work</h2><p className="muted">There is currently no PENDING open/assigned work or IN_PROGRESS work visible to this membership.</p></section>:
   <section className="scheduleGrid">{work.map(item=><article className="scheduleCard" key={item.id}>
    <div className="scheduleCardHead"><div><span className={`statusPill ${item.status==="IN_PROGRESS"?"activePill":"inactivePill"}`}>{item.status}</span><h2>{item.schedule_name_snapshot}</h2><p>{item.work_area_name_snapshot} · {item.site_name_snapshot}</p></div><strong>{item.assigned_to_me?"Assigned to me":"Open"}</strong></div>
    <div className="scheduleSummaryGrid">
     <div><span>Local</span><strong>{item.local_date_snapshot} {item.local_time_snapshot}</strong></div>
     <div><span>UTC</span><strong>{item.scheduled_start_utc} → {item.scheduled_end_utc}</strong></div>
     <div><span>Tasks</span><strong>{item.task_count} · {item.evidence_task_count} evidence</strong></div>
     <div><span>Planned</span><strong>{item.planned_duration_minutes} min</strong></div>
    </div>
    {item.status==="PENDING"&&!item.assigned_to_me?<form action={claimOccurrence}><input type="hidden" name="occurrenceId" value={item.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><button className="button" type="submit">Claim work</button></form>:null}
    {item.status==="PENDING"&&item.assigned_to_me?<form action={startOccurrence}><input type="hidden" name="occurrenceId" value={item.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><label>Work Area QR token<input name="qrToken" required placeholder="Scan/paste active QR token"/></label><button className="button" type="submit">Validate QR & Start</button></form>:null}
    {item.status==="IN_PROGRESS"?<p><strong>Started:</strong> {item.started_at??"server timestamp recorded"}</p>:null}
   </article>)}</section>}
  </>}
 </main>;
}
