import Link from "next/link";
import {redirect} from "next/navigation";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot,onboardingPath} from "@/lib/onboarding/server";
import {listOccurrences} from "@/lib/occurrences/server";

export default async function OccurrencesPage(){
 const user=await requireAuthenticatedUser(),snapshot=await getOnboardingSnapshot(user.id);
 if(!snapshot||snapshot.onboarding_state!=="ONBOARDING_COMPLETE")redirect(onboardingPath(snapshot?.onboarding_state??"REGISTERED"));
 if(!snapshot.app_user_id||!snapshot.organization_id||!snapshot.membership_id)redirect("/workspace");
 const context={userId:snapshot.app_user_id,organizationId:snapshot.organization_id,membershipId:snapshot.membership_id};
 const occurrences=await listOccurrences(context);

 return <main className="workspacePage">
  <header className="workspaceHeader">
   <div><span className="eyebrow">GENERATED PLANNING</span><h1>Occurrences</h1><p>{snapshot.organization_name} · {occurrences.length} visible snapshot{occurrences.length===1?"":"s"}</p></div>
   <Link className="button secondaryButton" href="/workspace">Workspace</Link>
  </header>
  <section className="workspacePanel">
   <span className="eyebrow">OCCURRENCE FOUNDATION 01</span>
   <h2>Immutable execution-ready planning snapshots</h2>
   <p className="muted">Active Schedule masters reconcile into bounded upcoming Occurrences. UTC planned timestamps, local intent, timezone/offset, working-hours source, controlled-document references, Work Area details, Task instructions, and deterministic evidence decisions are snapshotted before later mobile execution.</p>
  </section>
  <section className="workspacePanel">
   <span className="eyebrow">TIME + WORKING HOURS</span>
   <h2>Server-authoritative generation</h2>
   <p className="muted">Nonexistent DST-gap local times are skipped. Ambiguous overlap times use PostgreSQL&apos;s canonical timezone instant and snapshot the selected offset. Generation requires the complete planned wall-clock span to fit effective Work Area → Site → Organization working hours.</p>
  </section>
  <section className="scheduleGrid">
   {occurrences.length===0?<article className="workspacePanel"><h2>No generated Occurrences visible</h2><p className="muted">Schedule create/edit/status actions reconcile a 48-hour planning horizon. A Schedule outside the horizon, inside a DST gap, or outside effective working hours will not produce a PENDING Occurrence.</p></article>:
   occurrences.map(o=><article className="scheduleCard" key={o.id}>
    <div className="scheduleCardHead"><div><span className={`statusPill ${o.status==="PENDING"?"activePill":"inactivePill"}`}>{o.status}</span><h2>{o.schedule_name_snapshot}</h2><p>{o.work_area_name_snapshot} · {o.site_name_snapshot}</p></div><span className="taskVersion">{o.task_count} tasks</span></div>
    <div className="scheduleSummaryGrid">
     <div><span>Local intent</span><strong>{o.local_date_snapshot} {o.local_time_snapshot}</strong></div>
     <div><span>Timezone</span><strong>{o.timezone_snapshot} · UTC{o.utc_offset_minutes_snapshot>=0?"+":""}{o.utc_offset_minutes_snapshot/60}</strong></div>
     <div><span>UTC window</span><strong>{o.scheduled_start_utc} → {o.scheduled_end_utc}</strong></div>
     <div><span>Planned</span><strong>{o.planned_duration_minutes} min · {o.evidence_task_count} evidence task{o.evidence_task_count===1?"":"s"}</strong></div>
    </div>
    <p className="muted">Working hours snapshot: {o.working_hours_source_snapshot} · supersede unstarted: {o.supersede_unstarted_snapshot?"Yes":"No"}</p>
    {o.document_reference_snapshot||o.document_revision_snapshot?<p className="muted">Document: {o.document_reference_snapshot||"—"} · {o.document_revision_snapshot||"—"}</p>:null}
   </article>)}
  </section>
 </main>;
}
