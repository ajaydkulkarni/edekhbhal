import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot,onboardingPath} from "@/lib/onboarding/server";
import {createSchedule,toggleScheduleStatus,updateSchedule} from "@/lib/schedules/actions";
import {listScheduleInputs,listSchedules,type ScheduleRow} from "@/lib/schedules/server";

type Props={searchParams:Promise<{error?:string;message?:string}>};
const days=[["Sun",0],["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6]] as const;

function TaskFields({task,selected}:{task:{id:string;name:string};selected?:ScheduleRow["tasks"][number]}){
 return <div className="scheduleTaskChoice">
  <label className="scheduleTaskSelect"><input type="checkbox" name="taskId" value={task.id} defaultChecked={Boolean(selected)}/><strong>{task.name}</strong></label>
  <div className="scheduleTaskSettings">
   <label>Sequence<input type="number" min={1} name={`sequence_${task.id}`} defaultValue={selected?.sequence??""} placeholder="1"/></label>
   <label>Minutes<input type="number" min={1} max={10080} name={`duration_${task.id}`} defaultValue={selected?.planned_duration_minutes??30}/></label>
   <label>Evidence<select name={`evidence_${task.id}`} defaultValue={selected?.evidence_rule??"NONE"}><option value="NONE">None</option><option value="PHOTO">Photo</option><option value="VIDEO">Video</option><option value="RANDOM">Random subset</option></select></label>
   <label>Random 1 in N<input type="number" min={2} max={1000} name={`randomEveryN_${task.id}`} defaultValue={selected?.random_every_n??3}/></label>
   <label>Random media<select name={`randomEvidenceType_${task.id}`} defaultValue={selected?.random_evidence_type??"EITHER"}><option value="PHOTO">Photo</option><option value="VIDEO">Video</option><option value="EITHER">Either</option></select></label>
  </div>
 </div>
}

function ScheduleForm({action,workAreas,tasks,schedule}:{action:(formData:FormData)=>Promise<void>;workAreas:Array<{id:string;site_name:string;name:string;timezone:string}>;tasks:Array<{id:string;name:string}>;schedule?:ScheduleRow}){
 const selected=new Map(schedule?.tasks.map(t=>[t.task_id,t])),weekdays=new Set(schedule?.recurrence_config?.weekdays??[]);
 return <form action={action} className="formStack">
  {schedule?<><input type="hidden" name="scheduleId" value={schedule.id}/><input type="hidden" name="expectedVersion" value={schedule.version}/></>:<input type="hidden" name="idempotencyKey" value={randomUUID()}/>}
  <div className="formGrid">
   <label>Schedule name<input name="name" required maxLength={500} defaultValue={schedule?.name??""}/></label>
   <label>Work Area<select name="workAreaId" required defaultValue={schedule?.work_area_id??""}><option value="">Select Work Area</option>{workAreas.map(a=><option key={a.id} value={a.id}>{a.name} — {a.site_name} ({a.timezone})</option>)}</select></label>
   <label>Document / SOP Reference<input name="documentReference" maxLength={150} placeholder="QMS-PRD-017" defaultValue={schedule?.document_reference??""}/></label>
   <label>Revision / Version<input name="documentRevision" maxLength={100} placeholder="Rev 03" defaultValue={schedule?.document_revision??""}/></label>
  </div>
  <div className="scheduleWhenGrid">
   <label>Frequency<select name="frequencyType" defaultValue={schedule?.frequency_type??"ONE_TIME"}><option value="ONE_TIME">One Time</option><option value="RECURRING">Recurring</option></select></label>
   <label>Start local date/time<input type="datetime-local" name="startLocal" required defaultValue={schedule?`${schedule.start_local_date}T${schedule.start_local_time.slice(0,5)}`:""}/></label>
   <label>Recurrence unit<select name="recurrenceUnit" defaultValue={schedule?.recurrence_unit??"DAY"}><option value="MINUTE">Minute</option><option value="HOUR">Hour</option><option value="DAY">Day</option><option value="WEEK">Week</option><option value="MONTH">Month</option><option value="YEAR">Year</option></select></label>
   <label>Every N units<input type="number" min={1} max={100000} name="recurrenceInterval" defaultValue={schedule?.recurrence_interval??1}/></label>
   <label>End local date (optional)<input type="date" name="endLocalDate" defaultValue={schedule?.end_local_date??""}/></label>
   <label>Monthly day(s)<input name="monthDays" placeholder="1, 15, 31" defaultValue={schedule?.recurrence_config?.monthDays?.join(", ")??""}/></label>
  </div>
  <fieldset className="scheduleWeekdays"><legend>Weekly days</legend>{days.map(([label,value])=><label key={value}><input type="checkbox" name="weekday" value={value} defaultChecked={weekdays.has(value)}/>{label}</label>)}</fieldset>
  <div className="scheduleIntentNote"><strong>Local scheduling intent</strong><span>The Site IANA timezone is snapshotted when saved. UTC Occurrences are generated later, so DST gaps/overlaps do not silently rewrite this master.</span></div>
  <div><span className="eyebrow">ORDERED TASKS</span><p className="muted">Select Tasks and assign contiguous sequence numbers starting at 1. RANDOM means a deterministic 1-in-N subset when Occurrences are generated later.</p><div className="scheduleTaskPicker">{tasks.map(t=><TaskFields key={t.id} task={t} selected={selected.get(t.id)}/>)}</div></div>
  <button className="button" type="submit">{schedule?"Save Schedule":"Create Schedule"}</button>
 </form>
}

export default async function SchedulesPage({searchParams}:Props){
 const user=await requireAuthenticatedUser(),snapshot=await getOnboardingSnapshot(user.id);
 if(!snapshot||snapshot.onboarding_state!=="ONBOARDING_COMPLETE")redirect(onboardingPath(snapshot?.onboarding_state??"REGISTERED"));
 if(!snapshot.app_user_id||!snapshot.organization_id||!snapshot.membership_id)redirect("/workspace");
 const context={userId:snapshot.app_user_id,organizationId:snapshot.organization_id,membershipId:snapshot.membership_id};
 const[{workAreas,tasks},schedules,params]=await Promise.all([listScheduleInputs(context),listSchedules(context),searchParams]);
 const canManage=snapshot.role_code==="ADMIN"||snapshot.role_code==="SITE_MANAGER";
 return <main className="workspacePage">
  <header className="workspaceHeader"><div><span className="eyebrow">PLANNING</span><h1>Schedules</h1><p>{snapshot.organization_name} · {schedules.length} Schedule{schedules.length===1?"":"s"}</p></div><Link className="button secondaryButton" href="/workspace">Workspace</Link></header>
  {params.error?<div className="formNotice errorNotice workspaceNotice">{params.error}</div>:null}{params.message?<div className="formNotice successNotice workspaceNotice">{params.message}</div>:null}
  <section className="workspacePanel"><span className="eyebrow">SCHEDULE MASTER FOUNDATION</span><h2>Work Area → ordered Tasks → local timing intent</h2><p className="muted">One-time and recurring plans are masters only. Field execution happens against future generated Occurrences, not against this Schedule master.</p></section>
  {canManage?<section className="workspacePanel"><span className="eyebrow">NEW SCHEDULE</span><h2>Create a reusable plan</h2>{workAreas.length&&tasks.length?<ScheduleForm action={createSchedule} workAreas={workAreas} tasks={tasks}/>:<p className="muted">At least one active accessible Work Area and one active Task are required.</p>}</section>:<section className="workspacePanel"><span className="eyebrow">READ ONLY</span><h2>Schedule library access</h2><p className="muted">USER can review Schedules in assigned Site scope but cannot change Schedule masters.</p></section>}
  <section className="scheduleGrid">{schedules.length===0?<article className="workspacePanel"><h2>No Schedules yet</h2><p>Create the first Schedule after defining a Work Area and reusable Tasks.</p></article>:schedules.map(s=><article className="scheduleCard" key={s.id}>
   <div className="scheduleCardHead"><div><span className={`statusPill ${s.status==="ACTIVE"?"activePill":"inactivePill"}`}>{s.status}</span><h2>{s.name}</h2><p>{s.work_area_name} · {s.site_name}</p></div><span className="taskVersion">v{s.version}</span></div>
   <div className="scheduleSummaryGrid"><div><span>Frequency</span><strong>{s.frequency_type}</strong></div><div><span>Local start</span><strong>{s.start_local_date} {s.start_local_time.slice(0,5)}</strong></div><div><span>Timezone</span><strong>{s.timezone}</strong></div><div><span>Tasks</span><strong>{s.tasks.length}</strong></div></div>
   {s.frequency_type==="RECURRING"?<p className="muted">Every {s.recurrence_interval} {s.recurrence_unit}{s.end_local_date?` · through ${s.end_local_date} (inclusive local date)`:""}</p>:null}
   {s.document_reference||s.document_revision?<p className="muted">Document: {s.document_reference||"—"} · {s.document_revision||"—"}</p>:null}
   <ol className="scheduleTaskTimeline">{s.tasks.map(t=><li key={`${s.id}-${t.sequence}`}><strong>{t.sequence}. {t.task_name}</strong><span>{t.planned_duration_minutes} min · offsets {t.planned_start_offset_minutes}–{t.planned_end_offset_minutes} · {t.evidence_rule}{t.evidence_rule==="RANDOM"?` 1 in ${t.random_every_n} (${t.random_evidence_type})`:""}</span></li>)}</ol>
   {canManage?<><details className="scheduleEdit"><summary>Edit Schedule</summary><ScheduleForm action={updateSchedule} workAreas={workAreas} tasks={tasks} schedule={s}/></details><form action={toggleScheduleStatus} className="taskStatusForm"><input type="hidden" name="scheduleId" value={s.id}/><input type="hidden" name="expectedVersion" value={s.version}/><input type="hidden" name="currentStatus" value={s.status}/><button className="button secondaryButton" type="submit">{s.status==="ACTIVE"?"Make inactive":"Reactivate"}</button></form></>:null}
  </article>)}</section>
 </main>
}
