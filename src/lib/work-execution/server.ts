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
 version:number;
};

export type OccurrenceTaskRow={
 id:string;
 task_name_snapshot:string;
 task_instructions_snapshot:string;
 sequence:number;
 planned_duration_minutes:number;
 evidence_required:boolean;
 required_evidence_type:"PHOTO"|"VIDEO"|null;
 status:"PENDING"|"IN_PROGRESS"|"COMPLETED"|"MISSED"|"CANCELED";
 started_at:string|null;
 completed_at:string|null;
 actual_duration_seconds:number|null;
 execution_notes:string|null;
 version:number;
};

export type OccurrenceEvidenceRow={
 id:string;
 occurrence_task_id:string;
 evidence_type:"PHOTO"|"VIDEO";
 content_type:string|null;
 byte_size:number|null;
 verification_status:"PENDING"|"VERIFIED"|"REJECTED";
 upload_status:"INTENT"|"UPLOADED";
 processing_status:"NOT_QUEUED"|"QUEUED"|"PROCESSING"|"DONE"|"FAILED";
 processing_attempt_count:number;
 processing_error:string|null;
 normalized_content_type:string|null;
 normalized_byte_size:number|null;
 original_disposition:"PENDING"|"RETAIN"|"DELETE_QUEUED"|"DELETED";
 uploaded_at:string|null;
 created_at:string;
 version:number;
};

type Raw=Omit<MyWorkRow,"planned_duration_minutes"|"assigned_to_me"|"task_count"|"evidence_task_count"|"rank_bucket"|"version"> & {
 planned_duration_minutes:number|string;
 assigned_to_me:boolean;
 task_count:number|string;
 evidence_task_count:number|string;
 rank_bucket:number|string;
 version:number|string;
};

type RawTask=Omit<OccurrenceTaskRow,"sequence"|"planned_duration_minutes"|"actual_duration_seconds"|"version"> & {
 sequence:number|string;
 planned_duration_minutes:number|string;
 actual_duration_seconds:number|string|null;
 version:number|string;
};

type RawEvidence=Omit<OccurrenceEvidenceRow,"byte_size"|"processing_attempt_count"|"normalized_byte_size"|"version"> & {
 byte_size:number|string|null;
 processing_attempt_count:number|string;
 normalized_byte_size:number|string|null;
 version:number|string;
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
    end rank_bucket,
    o.version
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
   rank_bucket:Number(r.rank_bucket),
   version:Number(r.version)
  })) as MyWorkRow[];
 });
}

export async function getMyWorkOccurrence(
 context:TenantRuntimeContext,
 occurrenceId:string
){
 return withTenantContext(context,async tx=>{
  const rows=await tx<Raw[]>`
   select
    o.id,o.status,o.schedule_name_snapshot,o.site_name_snapshot,o.work_area_name_snapshot,
    o.timezone_snapshot,o.local_date_snapshot::text,
    to_char(o.local_time_snapshot,'HH24:MI') local_time_snapshot,
    to_char(o.scheduled_start_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') scheduled_start_utc,
    to_char(o.scheduled_end_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') scheduled_end_utc,
    o.planned_duration_minutes,
    (o.assigned_membership_id=app_private.current_membership_id()) assigned_to_me,
    case
     when o.claimed_at is null then null
     else to_char(o.claimed_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')
    end claimed_at,
    case
     when o.started_at is null then null
     else to_char(o.started_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')
    end started_at,
    (select count(*) from schedule_occurrence_task ot where ot.occurrence_id=o.id) task_count,
    (
     select count(*)
     from schedule_occurrence_task ot
     where ot.occurrence_id=o.id
       and ot.evidence_required
    ) evidence_task_count,
    case
     when o.status='IN_PROGRESS'
      and o.assigned_membership_id=app_private.current_membership_id() then 0
     when o.assigned_membership_id=app_private.current_membership_id() then 1
     when o.scheduled_end_utc<now() then 2
     when o.scheduled_start_utc<=now() then 3
     else 4
    end rank_bucket,
    o.version
   from schedule_occurrence o
   where o.id=${occurrenceId}
     and (
      (
       o.status='IN_PROGRESS'
       and o.assigned_membership_id=app_private.current_membership_id()
      )
      or
      (
       o.status='PENDING'
       and (
        o.assigned_membership_id is null
        or o.assigned_membership_id=app_private.current_membership_id()
       )
      )
     )
   limit 1
  `;

  const r=rows[0];
  if(!r)return null;

  return{
   ...r,
   planned_duration_minutes:Number(r.planned_duration_minutes),
   task_count:Number(r.task_count),
   evidence_task_count:Number(r.evidence_task_count),
   rank_bucket:Number(r.rank_bucket),
   version:Number(r.version),
  } as MyWorkRow;
 });
}


export async function listOccurrenceTasks(context:TenantRuntimeContext,occurrenceId:string){
 return withTenantContext(context,async tx=>{
  const rows=await tx<RawTask[]>`
   select
    ot.id,ot.task_name_snapshot,ot.task_instructions_snapshot,ot.sequence,
    ot.planned_duration_minutes,ot.evidence_required,ot.required_evidence_type,ot.status,
    case when ot.started_at is null then null else to_char(ot.started_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') end started_at,
    case when ot.completed_at is null then null else to_char(ot.completed_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') end completed_at,
    ot.actual_duration_seconds,ot.execution_notes,ot.version
   from schedule_occurrence_task ot
   where ot.occurrence_id=${occurrenceId}
   order by ot.sequence
  `;
  return rows.map(r=>({...r,
   sequence:Number(r.sequence),
   planned_duration_minutes:Number(r.planned_duration_minutes),
   actual_duration_seconds:r.actual_duration_seconds===null?null:Number(r.actual_duration_seconds),
   version:Number(r.version)
  })) as OccurrenceTaskRow[];
 });
}

export async function listOccurrenceEvidence(context:TenantRuntimeContext,occurrenceId:string){
 return withTenantContext(context,async tx=>{
  const rows=await tx<RawEvidence[]>`
   select
    e.id,e.occurrence_task_id,e.evidence_type,e.content_type,e.byte_size,
    e.verification_status,e.upload_status,e.processing_status,e.processing_attempt_count,
    e.processing_error,e.normalized_content_type,e.normalized_byte_size,e.original_disposition,
    case when e.uploaded_at is null then null else to_char(e.uploaded_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') end uploaded_at,
    to_char(e.created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') created_at,
    e.version
   from schedule_occurrence_evidence e
   where e.occurrence_id=${occurrenceId}
   order by e.created_at,e.id
  `;
  return rows.map(r=>({...r,
   byte_size:r.byte_size===null?null:Number(r.byte_size),
   processing_attempt_count:Number(r.processing_attempt_count),
   normalized_byte_size:r.normalized_byte_size===null?null:Number(r.normalized_byte_size),
   version:Number(r.version)
  })) as OccurrenceEvidenceRow[];
 });
}
