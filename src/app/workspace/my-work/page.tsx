import Link from "next/link";
import {redirect} from "next/navigation";
import {randomUUID} from "node:crypto";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot,onboardingPath} from "@/lib/onboarding/server";
import {
 claimOccurrence,completeOccurrenceTask,partiallyCompleteOccurrence,startOccurrence
} from "@/lib/work-execution/actions";
import {
 listMyWork,listOccurrenceEvidence,listOccurrenceTasks,
 type OccurrenceEvidenceRow,type OccurrenceTaskRow
} from "@/lib/work-execution/server";
import {EvidenceCapture} from "./evidence-capture";

const instructionText=(html:string)=>html
 .replace(/<br\s*\/?>/gi,"\n")
 .replace(/<\/p>/gi,"\n")
 .replace(/<[^>]+>/g,"")
 .replace(/&nbsp;/g," ")
 .replace(/&amp;/g,"&")
 .replace(/&lt;/g,"<")
 .replace(/&gt;/g,">")
 .trim();

export default async function MyWorkPage({searchParams}:{searchParams:Promise<{message?:string;error?:string}>}){
 const user=await requireAuthenticatedUser(),snapshot=await getOnboardingSnapshot(user.id);
 if(!snapshot||snapshot.onboarding_state!=="ONBOARDING_COMPLETE")redirect(onboardingPath(snapshot?.onboarding_state??"REGISTERED"));
 if(!snapshot.app_user_id||!snapshot.organization_id||!snapshot.membership_id)redirect("/workspace");
 const params=await searchParams;
 const context={userId:snapshot.app_user_id,organizationId:snapshot.organization_id,membershipId:snapshot.membership_id};
 const work=snapshot.role_code==="USER"?await listMyWork(context):[];
 const tasksByOccurrence:Record<string,OccurrenceTaskRow[]>={};
 const evidenceByTask:Record<string,OccurrenceEvidenceRow[]>={};

 if(snapshot.role_code==="USER"){
  for(const item of work){
   if(item.status!=="IN_PROGRESS")continue;
   tasksByOccurrence[item.id]=await listOccurrenceTasks(context,item.id);
   const evidence=await listOccurrenceEvidence(context,item.id);
   for(const row of evidence){
    (evidenceByTask[row.occurrence_task_id]??=[]).push(row);
   }
  }
 }

 return <main className="workspacePage">
  <header className="workspaceHeader">
   <div><span className="eyebrow">FIELD EXECUTION</span><h1>My Work</h1><p>{snapshot.organization_name} · server-ranked eligible work</p></div>
   <Link className="button secondaryButton" href="/workspace">Workspace</Link>
  </header>
  {params.message?<section className="workspacePanel"><strong>{params.message}</strong></section>:null}
  {params.error?<section className="workspacePanel"><strong>Operation blocked</strong><p>{params.error}</p></section>:null}
  {snapshot.role_code!=="USER"?
   <section className="workspacePanel"><h2>USER execution role required</h2><p className="muted">ADMIN and SITE_MANAGER retain planning/management surfaces. My Work execution is intentionally a USER command boundary.</p></section>:
   <>
    <section className="workspacePanel">
     <span className="eyebrow">EVIDENCE CAPTURE FOUNDATION 01</span>
     <h2>Claim → QR start → sequential Task execution → private evidence → server completion</h2>
     <p className="muted">
      Evidence-required Tasks use a server-issued object path and private direct upload.
      Upload does not equal verification: Task completion remains fail-closed until matching Evidence is VERIFIED.
     </p>
    </section>
    {work.length===0?
     <section className="workspacePanel"><h2>No eligible work</h2><p className="muted">There is currently no PENDING open/assigned work or IN_PROGRESS work visible to this membership.</p></section>:
     <section className="scheduleGrid">{work.map(item=>{
      const tasks=tasksByOccurrence[item.id]??[];
      const hasCompleted=tasks.some(t=>t.status==="COMPLETED");
      const hasRemaining=tasks.some(t=>t.status!=="COMPLETED");
      return <article className="scheduleCard" key={item.id}>
       <div className="scheduleCardHead">
        <div><span className={`statusPill ${item.status==="IN_PROGRESS"?"activePill":"inactivePill"}`}>{item.status}</span><h2>{item.schedule_name_snapshot}</h2><p>{item.work_area_name_snapshot} · {item.site_name_snapshot}</p></div>
        <strong>{item.assigned_to_me?"Assigned to me":"Open"}</strong>
       </div>
       <div className="scheduleSummaryGrid">
        <div><span>Local</span><strong>{item.local_date_snapshot} {item.local_time_snapshot}</strong></div>
        <div><span>UTC</span><strong>{item.scheduled_start_utc} → {item.scheduled_end_utc}</strong></div>
        <div><span>Tasks</span><strong>{item.task_count} · {item.evidence_task_count} evidence</strong></div>
        <div><span>Planned</span><strong>{item.planned_duration_minutes} min</strong></div>
       </div>
       {item.status==="PENDING"&&!item.assigned_to_me?
        <form action={claimOccurrence}>
         <input type="hidden" name="occurrenceId" value={item.id}/>
         <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
         <button className="button" type="submit">Claim work</button>
        </form>:null}
       {item.status==="PENDING"&&item.assigned_to_me?
        <form action={startOccurrence}>
         <input type="hidden" name="occurrenceId" value={item.id}/>
         <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
         <label>Work Area QR token<input name="qrToken" required placeholder="Scan/paste active QR token"/></label>
         <button className="button" type="submit">Validate QR & Start</button>
        </form>:null}
       {item.status==="IN_PROGRESS"?<>
        <p><strong>Started:</strong> {item.started_at??"server timestamp recorded"}</p>
        <div className="scheduleTaskTimeline">{tasks.map(task=>{
         const evidence=evidenceByTask[task.id]??[];
         const verified=evidence.some(row=>
          row.verification_status==="VERIFIED"&&row.evidence_type===task.required_evidence_type
         );
         return <div key={task.id}>
          <strong>{task.sequence}. {task.task_name_snapshot}</strong>
          <p>{instructionText(task.task_instructions_snapshot)}</p>
          <p className="muted">
           {task.status} · planned {task.planned_duration_minutes} min
           {task.actual_duration_seconds!==null?` · actual ${task.actual_duration_seconds}s`:""}
           {task.evidence_required?` · ${task.required_evidence_type} evidence required`:""}
          </p>

          {evidence.length>0?<div>
           <strong>Evidence</strong>
           {evidence.map(row=><p className="muted" key={row.id}>
            {row.evidence_type} · {row.upload_status} · {row.verification_status}
            {row.byte_size!==null?` · ${Math.ceil(row.byte_size/1024)} KB`:""}
            {row.uploaded_at?` · uploaded ${row.uploaded_at} UTC`:""}
           </p>)}
          </div>:null}

          {task.status==="IN_PROGRESS"&&task.evidence_required&&!verified&&task.required_evidence_type?
           <>
            <EvidenceCapture
             taskId={task.id}
             taskVersion={task.version}
             evidenceType={task.required_evidence_type}
            />
            <p><strong>Evidence gate:</strong> Uploading records private metadata but does not self-verify. Completion stays blocked until the required evidence is VERIFIED by the media verification pipeline.</p>
           </>:null}

          {task.status==="IN_PROGRESS"&&(!task.evidence_required||verified)?
           <form action={completeOccurrenceTask}>
            <input type="hidden" name="occurrenceTaskId" value={task.id}/>
            <input type="hidden" name="expectedVersion" value={task.version}/>
            <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
            <label>Task notes (optional)<textarea name="notes" maxLength={4000} placeholder="Optional execution note"/></label>
            <button className="button" type="submit">Complete Task</button>
           </form>:null}
         </div>;
        })}</div>
        {hasCompleted&&hasRemaining?
         <form action={partiallyCompleteOccurrence}>
          <input type="hidden" name="occurrenceId" value={item.id}/>
          <input type="hidden" name="expectedVersion" value={item.version}/>
          <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
          <label>Reason for ending partially completed<input name="reason" minLength={3} maxLength={1000} required placeholder="Explain why remaining Tasks cannot be completed"/></label>
          <button className="button secondaryButton" type="submit">End as Partially Completed</button>
         </form>:null}
       </>:null}
      </article>;
     })}</section>}
   </>}
 </main>;
}
