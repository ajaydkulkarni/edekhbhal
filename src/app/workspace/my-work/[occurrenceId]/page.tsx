import Link from "next/link";
import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {
 getOnboardingSnapshot,
 onboardingPath,
} from "@/lib/onboarding/server";
import {
 claimOccurrenceMobile,
 completeOccurrenceTaskMobile,
 partiallyCompleteOccurrenceMobile,
} from "@/lib/work-execution/actions";
import {
 getMyWorkOccurrence,
 listOccurrenceEvidence,
 listOccurrenceTasks,
 type OccurrenceEvidenceRow,
} from "@/lib/work-execution/server";
import {
 QrStartScanner,
} from "./qr-start-scanner";
import {
 MobileEvidenceCapture,
} from "./mobile-evidence-capture";

const instructionText=(html:string)=>html
 .replace(/<br\s*\/?>/gi,"\n")
 .replace(/<\/p>/gi,"\n")
 .replace(/<[^>]+>/g,"")
 .replace(/&nbsp;/g," ")
 .replace(/&amp;/g,"&")
 .replace(/&lt;/g,"<")
 .replace(/&gt;/g,">")
 .trim();

type PageProps={
 params:Promise<{occurrenceId:string}>;
 searchParams:Promise<{
  task?:string;
  message?:string;
  error?:string;
 }>;
};

export default async function FocusedMyWorkPage({
 params,
 searchParams,
}:PageProps){
 const user=await requireAuthenticatedUser();

 const snapshot=await getOnboardingSnapshot(
  user.id
 );

 if(
  !snapshot
  || snapshot.onboarding_state!=="ONBOARDING_COMPLETE"
 ){
  redirect(
   onboardingPath(
    snapshot?.onboarding_state??"REGISTERED"
   )
  );
 }

 if(
  !snapshot.app_user_id
  || !snapshot.organization_id
  || !snapshot.membership_id
 ){
  redirect("/workspace");
 }

 if(snapshot.role_code!=="USER"){
  redirect(
   "/workspace/my-work?error="
   +encodeURIComponent(
    "USER execution role required."
   )
  );
 }

 const {occurrenceId}=await params;
 const query=await searchParams;

 const context={
  userId:snapshot.app_user_id,
  organizationId:snapshot.organization_id,
  membershipId:snapshot.membership_id,
 };

 const occurrence=await getMyWorkOccurrence(
  context,
  occurrenceId
 );

 if(!occurrence){
  redirect(
   "/workspace/my-work?message="
   +encodeURIComponent(
    "That work item is no longer available in My Work."
   )
  );
 }

 const tasks=await listOccurrenceTasks(
  context,
  occurrence.id
 );

 const evidence=await listOccurrenceEvidence(
  context,
  occurrence.id
 );

 const evidenceByTask:Record<
  string,
  OccurrenceEvidenceRow[]
 >={};

 for(const row of evidence){
  (
   evidenceByTask[
    row.occurrence_task_id
   ]??=[]
  ).push(row);
 }

 const requestedSequence=
  query.task
   ? Number(query.task)
   : null;

 const currentTask=
  tasks.find(
   task=>task.status==="IN_PROGRESS"
  )
  ??null;

 const activeTask=
  currentTask
  ??tasks.find(
   task=>task.status==="PENDING"
  )
  ??tasks[0]
  ??null;

 const selectedTask=
  (
   Number.isInteger(requestedSequence)
   && requestedSequence!==null
   ? tasks.find(
      task=>task.sequence===requestedSequence
     )
   : null
  )
  ??activeTask;

 const selectedIndex=
  selectedTask
   ? tasks.findIndex(
      task=>task.id===selectedTask.id
     )
   : -1;

 const selectedIsCurrent=
  Boolean(
   currentTask
   && selectedTask
   && currentTask.id===selectedTask.id
  );

 const previousTask=
  selectedIndex>0
   ? tasks[selectedIndex-1]
   : null;

 const nextTask=
  selectedIndex>=0
  && selectedIndex<tasks.length-1
   ? tasks[selectedIndex+1]
   : null;

 const selectedEvidence=
  selectedTask
   ? evidenceByTask[selectedTask.id]??[]
   : [];

 const verified=
  selectedTask
   ? selectedEvidence.some(
      row=>
       row.verification_status==="VERIFIED"
       && row.evidence_type
          ===selectedTask.required_evidence_type
     )
   : false;

 const canComplete=
  selectedIsCurrent
  && selectedTask?.status==="IN_PROGRESS"
  && (
   !selectedTask.evidence_required
   || verified
  );

 const hasCompleted=
  tasks.some(
   task=>task.status==="COMPLETED"
  );

 const hasRemaining=
  tasks.some(
   task=>task.status!=="COMPLETED"
  );

 return(
  <main className="workspacePage mobileExecutionPage">
   <header className="workspaceHeader mobileExecutionHeader">
    <div>
     <span className="eyebrow">
      MOBILE FIELD EXECUTION 05A
     </span>

     <h1>
      {occurrence.schedule_name_snapshot}
     </h1>

     <p>
      {occurrence.work_area_name_snapshot}
      {" · "}
      {occurrence.site_name_snapshot}
     </p>
    </div>

    <Link
     className="button secondaryButton"
     href="/workspace/my-work"
    >
     My Work
    </Link>
   </header>

   {query.message?
    <section className="workspacePanel mobileExecutionNotice">
     <strong>{query.message}</strong>
    </section>
    :null}

   {query.error?
    <section className="workspacePanel mobileExecutionNotice">
     <strong>Operation blocked</strong>
     <p>{query.error}</p>
    </section>
    :null}

   <section className="workspacePanel mobileExecutionSummary">
    <div className="mobileExecutionStatusRow">
     <span
      className={
       `statusPill ${
        occurrence.status==="IN_PROGRESS"
         ?"activePill"
         :"inactivePill"
       }`
      }
     >
      {occurrence.status}
     </span>

     <strong>
      {occurrence.assigned_to_me
       ?"Assigned to me"
       :"Open work"}
     </strong>
    </div>

    <div className="scheduleSummaryGrid">
     <div>
      <span>Local start</span>
      <strong>
       {occurrence.local_date_snapshot}
       {" "}
       {occurrence.local_time_snapshot}
      </strong>
     </div>

     <div>
      <span>Planned</span>
      <strong>
       {occurrence.planned_duration_minutes} min
      </strong>
     </div>

     <div>
      <span>Tasks</span>
      <strong>
       {occurrence.task_count}
      </strong>
     </div>

     <div>
      <span>Evidence Tasks</span>
      <strong>
       {occurrence.evidence_task_count}
      </strong>
     </div>
    </div>
   </section>

   {occurrence.status==="PENDING"
    && !occurrence.assigned_to_me?
    <section className="workspacePanel mobileExecutionAction">
     <span className="eyebrow">
      STEP 1
     </span>

     <h2>Claim this work</h2>

     <p className="muted">
      Claiming is server-authoritative and preserves
      active-work exclusivity for your Organization Membership.
     </p>

     <form action={claimOccurrenceMobile}>
      <input
       type="hidden"
       name="occurrenceId"
       value={occurrence.id}
      />

      <input
       type="hidden"
       name="idempotencyKey"
       value={randomUUID()}
      />

      <button
       className="button mobilePrimaryButton"
       type="submit"
      >
       Claim Work
      </button>
     </form>
    </section>
    :null}

   {occurrence.status==="PENDING"
    && occurrence.assigned_to_me?
    <section className="workspacePanel mobileExecutionAction">
     <span className="eyebrow">
      STEP 2
     </span>

     <h2>Verify Work Area & Start</h2>

     <p className="muted">
      Scan the Work Area QR with the device camera.
      Manual token entry remains available as a fallback.
     </p>

     <QrStartScanner
      occurrenceId={occurrence.id}
      idempotencyKey={randomUUID()}
     />
    </section>
    :null}

   {occurrence.status==="IN_PROGRESS"
    && selectedTask?
    <>
     <section className="workspacePanel mobileTaskProgress">
      <div>
       <span className="eyebrow">
        TASK PROGRESS
       </span>

       <h2>
        Task {selectedTask.sequence}
        {" of "}
        {tasks.length}
       </h2>
      </div>

      <strong>
       {selectedTask.status}
      </strong>
     </section>

     <nav
      className="workspacePanel mobileTaskNavigator"
      aria-label="Task navigation"
     >
      {previousTask?
       <Link
        className="button secondaryButton"
        href={
         `/workspace/my-work/${occurrence.id}`
         +`?task=${previousTask.sequence}`
        }
       >
        ← Previous
       </Link>
       :
       <span
        className="button secondaryButton mobileDisabledButton"
        aria-disabled="true"
       >
        ← Previous
       </span>}

      <span className="mobileTaskPosition">
       {selectedTask.sequence}
       {" / "}
       {tasks.length}
      </span>

      {nextTask?
       <Link
        className="button secondaryButton"
        href={
         `/workspace/my-work/${occurrence.id}`
         +`?task=${nextTask.sequence}`
        }
       >
        Next →
       </Link>
       :
       <span
        className="button secondaryButton mobileDisabledButton"
        aria-disabled="true"
       >
        Next →
       </span>}
     </nav>

     <section className="workspacePanel mobileCurrentTask">
      <span
       className={
        `statusPill ${
         selectedTask.status==="IN_PROGRESS"
          ?"activePill"
          :"inactivePill"
        }`
       }
      >
       {selectedTask.status}
      </span>

      <h2>
       {selectedTask.sequence}.
       {" "}
       {selectedTask.task_name_snapshot}
      </h2>

      {!selectedIsCurrent&&currentTask?
       <div className="mobileReadOnlyTaskNotice">
        <strong>Read-only Task view</strong>

        <p>
         Previous and Next only change the Task being viewed.
         Execution actions remain attached to the current
         IN_PROGRESS Task.
        </p>

        <Link
         href={
          `/workspace/my-work/${occurrence.id}`
          +`?task=${currentTask.sequence}`
         }
        >
         Return to current Task →
        </Link>
       </div>
       :null}

      <p className="mobileTaskInstructions">
       {instructionText(
        selectedTask.task_instructions_snapshot
       )}
      </p>

      <div className="mobileTaskFacts">
       <div>
        <span>Planned</span>
        <strong>
         {selectedTask.planned_duration_minutes} min
        </strong>
       </div>

       <div>
        <span>Evidence</span>
        <strong>
         {selectedTask.evidence_required
          ?selectedTask.required_evidence_type
          :"Not required"}
        </strong>
       </div>

       <div>
        <span>Actual</span>
        <strong>
         {selectedTask.actual_duration_seconds!==null
          ?`${selectedTask.actual_duration_seconds}s`
          :"—"}
        </strong>
       </div>
      </div>

      {selectedEvidence.length>0?
       <div className="mobileEvidenceState">
        <h3>Evidence</h3>

        {selectedEvidence.map(row=>
         <article
          key={row.id}
          className="mobileEvidenceRow"
         >
          <strong>
           {row.evidence_type}
          </strong>

          <span>
           {row.upload_status}
           {" · "}
           {row.processing_status}
           {" · "}
           {row.verification_status}
          </span>

          {row.upload_status==="UPLOADED"?
           <Link
            href={
             `/workspace/evidence/${row.id}`
             +"?variant=BEST"
            }
            target="_blank"
            rel="noreferrer"
           >
            View · 60 sec
           </Link>
           :null}
         </article>
        )}
       </div>
       :null}

      {selectedIsCurrent
       && selectedTask.status==="IN_PROGRESS"
       && selectedTask.evidence_required
       && !verified
       && selectedTask.required_evidence_type?
       <div className="mobileEvidenceGate">
        <strong>
         {selectedTask.required_evidence_type}
         {" evidence required"}
        </strong>

        <p>
         Capture or select the required Evidence below.
         Task completion remains blocked until matching
         Evidence is VERIFIED by the media pipeline.
        </p>

        <MobileEvidenceCapture
         taskId={selectedTask.id}
         taskVersion={selectedTask.version}
         evidenceType={selectedTask.required_evidence_type}
        />
       </div>
       :null}

      {canComplete?
       <form
        className="mobileExecutionForm"
        action={completeOccurrenceTaskMobile}
       >
        <input
         type="hidden"
         name="occurrenceId"
         value={occurrence.id}
        />

        <input
         type="hidden"
         name="occurrenceTaskId"
         value={selectedTask.id}
        />

        <input
         type="hidden"
         name="expectedVersion"
         value={selectedTask.version}
        />

        <input
         type="hidden"
         name="idempotencyKey"
         value={randomUUID()}
        />

        <label>
         Task notes (optional)

         <textarea
          name="notes"
          maxLength={4000}
          rows={4}
          placeholder="Optional execution note"
         />
        </label>

        <button
         className="button mobilePrimaryButton"
         type="submit"
        >
         Complete Task
        </button>
       </form>
       :null}
     </section>

     {hasCompleted&&hasRemaining?
      <section className="workspacePanel mobilePartialCompletion">
       <h2>Cannot finish remaining work?</h2>

       <form
        className="mobileExecutionForm"
        action={partiallyCompleteOccurrenceMobile}
       >
        <input
         type="hidden"
         name="occurrenceId"
         value={occurrence.id}
        />

        <input
         type="hidden"
         name="expectedVersion"
         value={occurrence.version}
        />

        <input
         type="hidden"
         name="idempotencyKey"
         value={randomUUID()}
        />

        <label>
         Reason

         <textarea
          name="reason"
          minLength={3}
          maxLength={1000}
          rows={3}
          required
          placeholder="Explain why remaining Tasks cannot be completed"
         />
        </label>

        <button
         className="button secondaryButton"
         type="submit"
        >
         End as Partially Completed
        </button>
       </form>
      </section>
      :null}
    </>
    :null}
  </main>
 );
}
