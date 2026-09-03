import {withTenantContext,type TenantRuntimeContext} from "@/db/runtime";

export type ScheduleTaskRow={task_id:string;task_name:string;sequence:number;planned_duration_minutes:number;planned_start_offset_minutes:number;planned_end_offset_minutes:number;evidence_rule:"NONE"|"PHOTO"|"VIDEO"|"RANDOM";random_every_n:number|null;random_evidence_type:"PHOTO"|"VIDEO"|"EITHER"|null};
export type ScheduleRow={id:string;site_id:string;site_name:string;work_area_id:string;work_area_name:string;name:string;document_reference:string|null;document_revision:string|null;frequency_type:"ONE_TIME"|"RECURRING";recurrence_unit:"MINUTE"|"HOUR"|"DAY"|"WEEK"|"MONTH"|"YEAR"|null;recurrence_interval:number|null;recurrence_config:{weekdays?:number[];monthDays?:number[]}|null;start_local_date:string;start_local_time:string;timezone:string;end_local_date:string|null;status:"ACTIVE"|"INACTIVE";version:number;tasks:ScheduleTaskRow[]};
export type ScheduleWorkAreaOption={id:string;site_id:string;site_name:string;name:string;timezone:string};
export type ScheduleTaskOption={id:string;name:string};

type RawScheduleRow=Omit<ScheduleRow,"recurrence_interval"|"version"|"tasks"> & {
 recurrence_interval:number|string|null;
 version:number|string;
 tasks:ScheduleTaskRow[]|null;
};
export async function listSchedules(context:TenantRuntimeContext){
 const rows=await withTenantContext(context,tx=>tx<RawScheduleRow[]>`
  select sm.id,sm.site_id,s.name site_name,sm.work_area_id,w.name work_area_name,sm.name,
   sm.document_reference,sm.document_revision,sm.frequency_type,sm.recurrence_unit,sm.recurrence_interval,
   sm.recurrence_config,sm.start_local_date::text,to_char(sm.start_local_time,'HH24:MI') start_local_time,
   sm.timezone,sm.end_local_date::text,sm.status,sm.version,
   coalesce(jsonb_agg(jsonb_build_object(
    'task_id',st.task_id,'task_name',tm.name,'sequence',st.sequence,
    'planned_duration_minutes',st.planned_duration_minutes,
    'planned_start_offset_minutes',st.planned_start_offset_minutes,
    'planned_end_offset_minutes',st.planned_end_offset_minutes,'evidence_rule',st.evidence_rule,
    'random_every_n',st.random_every_n,'random_evidence_type',st.random_evidence_type
   ) order by st.sequence) filter(where st.id is not null),'[]'::jsonb) tasks
  from schedule_master sm join site s on s.id=sm.site_id join work_area w on w.id=sm.work_area_id
  left join schedule_task st on st.schedule_id=sm.id left join task_master tm on tm.id=st.task_id
  group by sm.id,s.id,w.id
  order by case when sm.status='ACTIVE' then 0 else 1 end,sm.start_local_date,sm.start_local_time,lower(sm.name)`);
 return rows.map(row=>({...row,recurrence_interval:row.recurrence_interval===null?null:Number(row.recurrence_interval),version:Number(row.version),tasks:row.tasks??[]})) as ScheduleRow[];
}

export async function listScheduleInputs(context:TenantRuntimeContext){
 const[workAreas,tasks]=await Promise.all([
  withTenantContext(context,tx=>tx<ScheduleWorkAreaOption[]>`
   select w.id,w.site_id,s.name site_name,w.name,s.timezone from work_area w join site s on s.id=w.site_id
   where w.status='ACTIVE' and s.status='ACTIVE' order by s.name,w.name`),
  withTenantContext(context,tx=>tx<ScheduleTaskOption[]>`
   select id,name from task_master where status='ACTIVE' order by lower(name),id`)
 ]);
 return{workAreas,tasks};
}
