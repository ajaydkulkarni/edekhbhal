import {withTenantContext,type TenantRuntimeContext} from "@/db/runtime";

export type OccurrenceRow={
 id:string;
 schedule_id:string;
 schedule_name_snapshot:string;
 site_name_snapshot:string;
 work_area_name_snapshot:string;
 timezone_snapshot:string;
 local_date_snapshot:string;
 local_time_snapshot:string;
 utc_offset_minutes_snapshot:number;
 scheduled_start_utc:string;
 scheduled_end_utc:string;
 planned_duration_minutes:number;
 document_reference_snapshot:string|null;
 document_revision_snapshot:string|null;
 working_hours_source_snapshot:"ORGANIZATION"|"SITE"|"WORK_AREA";
 supersede_unstarted_snapshot:boolean;
 status:"PENDING"|"IN_PROGRESS"|"COMPLETED"|"PARTIALLY_COMPLETED"|"MISSED"|"CANCELED";
 task_count:number;
 evidence_task_count:number;
};

type RawOccurrenceRow=Omit<OccurrenceRow,"utc_offset_minutes_snapshot"|"planned_duration_minutes"|"task_count"|"evidence_task_count"> & {
 utc_offset_minutes_snapshot:number|string;
 planned_duration_minutes:number|string;
 task_count:number|string;
 evidence_task_count:number|string;
};

export async function listOccurrences(context:TenantRuntimeContext){
 const rows=await withTenantContext(context,tx=>tx<RawOccurrenceRow[]>`
  select
   o.id,o.schedule_id,o.schedule_name_snapshot,o.site_name_snapshot,o.work_area_name_snapshot,
   o.timezone_snapshot,o.local_date_snapshot::text,
   to_char(o.local_time_snapshot,'HH24:MI') local_time_snapshot,
   o.utc_offset_minutes_snapshot,
   to_char(o.scheduled_start_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') scheduled_start_utc,
   to_char(o.scheduled_end_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') scheduled_end_utc,
   o.planned_duration_minutes,o.document_reference_snapshot,o.document_revision_snapshot,
   o.working_hours_source_snapshot,o.supersede_unstarted_snapshot,o.status,
   (select count(*) from schedule_occurrence_task ot where ot.occurrence_id=o.id) task_count,
   (select count(*) from schedule_occurrence_task ot where ot.occurrence_id=o.id and ot.evidence_required) evidence_task_count
  from schedule_occurrence o
  order by o.scheduled_start_utc,o.id
  limit 250
 `);
 return rows.map(row=>({
  ...row,
  utc_offset_minutes_snapshot:Number(row.utc_offset_minutes_snapshot),
  planned_duration_minutes:Number(row.planned_duration_minutes),
  task_count:Number(row.task_count),
  evidence_task_count:Number(row.evidence_task_count)
 })) as OccurrenceRow[];
}

export async function countUpcomingOccurrences(context:TenantRuntimeContext){
 const rows=await withTenantContext(context,tx=>tx<{count:number|string}[]>`
  select count(*) count
  from schedule_occurrence
  where status='PENDING' and scheduled_end_utc>=now()
 `);
 return Number(rows[0]?.count??0);
}
