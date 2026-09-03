import {withTenantContext,type TenantRuntimeContext} from "@/db/runtime";

export type MyWorkRow={
 id:string;
 status:"PENDING"|"IN_PROGRESS";
 schedule_name_snapshot:string;
 site_name_snapshot:string;
 work_area_name_snapshot:string;
 timezone_snapshot:string;
 local_date_snapshot:string;
 local_time_snapshot:string;
 scheduled_start_utc:string;
 scheduled_end_utc:string;
 planned_duration_minutes:number;
 assigned_to_me:boolean;
 claimed_at:string|null;
 started_at:string|null;
 task_count:number;
 evidence_task_count:number;
 rank_bucket:number;
};

type Raw=Omit<MyWorkRow,"planned_duration_minutes"|"assigned_to_me"|"task_count"|"evidence_task_count"|"rank_bucket"> & {
 planned_duration_minutes:number|string;
 assigned_to_me:boolean;
 task_count:number|string;
 evidence_task_count:number|string;
 rank_bucket:number|string;
};

export async function listMyWork(context:TenantRuntimeContext){
 return withTenantContext(context,async tx=>{
  await tx`select app_private.apply_due_supersession('WEB')`;
  const rows=await tx<Raw[]>`
   select
    o.id,o.status,o.schedule_name_snapshot,o.site_name_snapshot,o.work_area_name_snapshot,
    o.timezone_snapshot,o.local_date_snapshot::text,
    to_char(o.local_time_snapshot,'HH24:MI') local_time_snapshot,
    to_char(o.scheduled_start_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') scheduled_start_utc,
    to_char(o.scheduled_end_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') scheduled_end_utc,
    o.planned_duration_minutes,
    (o.assigned_membership_id=app_private.current_membership_id()) assigned_to_me,
    case when o.claimed_at is null then null else to_char(o.claimed_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') end claimed_at,
    case when o.started_at is null then null else to_char(o.started_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') end started_at,
    (select count(*) from schedule_occurrence_task ot where ot.occurrence_id=o.id) task_count,
    (select count(*) from schedule_occurrence_task ot where ot.occurrence_id=o.id and ot.evidence_required) evidence_task_count,
    case
      when o.status='IN_PROGRESS' and o.assigned_membership_id=app_private.current_membership_id() then 0
      when o.assigned_membership_id=app_private.current_membership_id() then 1
      when o.scheduled_end_utc<now() then 2
      when o.scheduled_start_utc<=now() then 3
      else 4
    end rank_bucket
   from schedule_occurrence o
   where (
     (o.status='IN_PROGRESS' and o.assigned_membership_id=app_private.current_membership_id())
     or
     (o.status='PENDING' and (
       o.assigned_membership_id is null
       or o.assigned_membership_id=app_private.current_membership_id()
     ))
   )
   order by rank_bucket,o.scheduled_start_utc,o.id
   limit 100
  `;
  return rows.map(r=>({...r,
   planned_duration_minutes:Number(r.planned_duration_minutes),
   task_count:Number(r.task_count),
   evidence_task_count:Number(r.evidence_task_count),
   rank_bucket:Number(r.rank_bucket)
  })) as MyWorkRow[];
 });
}
