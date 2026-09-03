-- Schedule Master Foundation 01
-- Planning layer only; Occurrence generation/execution is deliberately deferred.

do $$ begin create type schedule_frequency_type as enum ('ONE_TIME','RECURRING');
exception when duplicate_object then null; end $$;
do $$ begin create type schedule_recurrence_unit as enum ('MINUTE','HOUR','DAY','WEEK','MONTH','YEAR');
exception when duplicate_object then null; end $$;
do $$ begin create type schedule_evidence_rule as enum ('NONE','PHOTO','VIDEO','RANDOM');
exception when duplicate_object then null; end $$;
do $$ begin create type schedule_random_evidence_type as enum ('PHOTO','VIDEO','EITHER');
exception when duplicate_object then null; end $$;

create table if not exists schedule_master (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  site_id uuid not null references site(id),
  work_area_id uuid not null references work_area(id),
  name text not null,
  document_reference text,
  document_revision text,
  frequency_type schedule_frequency_type not null,
  recurrence_unit schedule_recurrence_unit,
  recurrence_interval integer,
  recurrence_config jsonb,
  start_local_date date not null,
  start_local_time time without time zone not null,
  timezone text not null,
  end_local_date date,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint schedule_master_name_not_blank check (length(trim(name)) > 0),
  constraint schedule_master_name_size check (length(name) <= 500),
  constraint schedule_master_document_reference_size check (document_reference is null or length(document_reference) <= 150),
  constraint schedule_master_document_revision_size check (document_revision is null or length(document_revision) <= 100),
  constraint schedule_master_recurrence_shape check (
    (frequency_type='ONE_TIME' and recurrence_unit is null and recurrence_interval is null and recurrence_config is null and end_local_date is null)
    or
    (frequency_type='RECURRING' and recurrence_unit is not null and recurrence_interval between 1 and 100000
      and (end_local_date is null or end_local_date >= start_local_date))
  )
);
create index if not exists schedule_master_org_site_idx on schedule_master(organization_id,site_id,status);
create index if not exists schedule_master_work_area_idx on schedule_master(work_area_id);

create table if not exists schedule_task (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  site_id uuid not null references site(id),
  work_area_id uuid not null references work_area(id),
  schedule_id uuid not null references schedule_master(id),
  task_id uuid not null references task_master(id),
  sequence integer not null,
  planned_duration_minutes integer not null,
  planned_start_offset_minutes integer not null,
  planned_end_offset_minutes integer not null,
  evidence_rule schedule_evidence_rule not null default 'NONE',
  random_every_n integer,
  random_evidence_type schedule_random_evidence_type,
  created_at timestamptz not null default now(),
  constraint schedule_task_sequence_positive check (sequence > 0),
  constraint schedule_task_duration_positive check (planned_duration_minutes > 0),
  constraint schedule_task_offsets_valid check (
    planned_start_offset_minutes >= 0
    and planned_end_offset_minutes = planned_start_offset_minutes + planned_duration_minutes
  ),
  constraint schedule_task_random_shape check (
    (evidence_rule='RANDOM' and random_every_n between 2 and 1000 and random_evidence_type is not null)
    or (evidence_rule<>'RANDOM' and random_every_n is null and random_evidence_type is null)
  ),
  constraint schedule_task_schedule_sequence_uq unique(schedule_id,sequence)
);
create index if not exists schedule_task_org_schedule_idx on schedule_task(organization_id,schedule_id);
create index if not exists schedule_task_task_idx on schedule_task(task_id);

create or replace function app_private.can_manage_schedule_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$ select app_private.current_role() in ('ADMIN','SITE_MANAGER') and app_private.has_site_scope(p_site_id) $$;
revoke all on function app_private.can_manage_schedule_site(uuid) from public;
grant execute on function app_private.can_manage_schedule_site(uuid) to vnext_runtime;

revoke all on schedule_master,schedule_task from public,anon,authenticated,vnext_runtime;
grant select,insert,update on schedule_master to vnext_runtime;
grant select,insert,update,delete on schedule_task to vnext_runtime;
alter table schedule_master enable row level security;
alter table schedule_master force row level security;
alter table schedule_task enable row level security;
alter table schedule_task force row level security;

drop policy if exists schedule_master_select on schedule_master;
create policy schedule_master_select on schedule_master for select to vnext_runtime using (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.has_site_scope(site_id)
);
drop policy if exists schedule_master_insert on schedule_master;
create policy schedule_master_insert on schedule_master for insert to vnext_runtime with check (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id) and app_private.has_active_site_access(site_id)
);
drop policy if exists schedule_master_update on schedule_master;
create policy schedule_master_update on schedule_master for update to vnext_runtime using (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id)
) with check (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id)
);

drop policy if exists schedule_task_select on schedule_task;
create policy schedule_task_select on schedule_task for select to vnext_runtime using (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.has_site_scope(site_id)
);
drop policy if exists schedule_task_insert on schedule_task;
create policy schedule_task_insert on schedule_task for insert to vnext_runtime with check (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id) and app_private.has_active_site_access(site_id)
);
drop policy if exists schedule_task_update on schedule_task;
create policy schedule_task_update on schedule_task for update to vnext_runtime using (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id)
) with check (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id)
);
drop policy if exists schedule_task_delete on schedule_task;
create policy schedule_task_delete on schedule_task for delete to vnext_runtime using (
 organization_id=app_private.current_organization_id() and app_private.has_active_context(organization_id)
 and app_private.can_manage_schedule_site(site_id)
);

create or replace function app_private.validate_schedule_recurrence(
 p_frequency_type schedule_frequency_type,p_recurrence_unit schedule_recurrence_unit,p_recurrence_interval integer,
 p_recurrence_config jsonb,p_start_local_date date,p_end_local_date date
) returns void language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare item jsonb; day_number integer;
begin
 if p_frequency_type='ONE_TIME' then
  if p_recurrence_unit is not null or p_recurrence_interval is not null or p_recurrence_config is not null or p_end_local_date is not null
  then raise exception 'One-time Schedule cannot contain recurrence settings'; end if;
  return;
 end if;
 if p_recurrence_unit is null or p_recurrence_interval is null or p_recurrence_interval<1 or p_recurrence_interval>100000
 then raise exception 'Recurring Schedule requires a valid interval and unit'; end if;
 if p_end_local_date is not null and p_end_local_date<p_start_local_date
 then raise exception 'Schedule End Date cannot be before the Start Date'; end if;
 if p_recurrence_unit='WEEK' then
  if p_recurrence_config is null or jsonb_typeof(p_recurrence_config->'weekdays')<>'array'
     or jsonb_array_length(p_recurrence_config->'weekdays')=0
  then raise exception 'Weekly recurrence requires at least one weekday'; end if;
  for item in select value from jsonb_array_elements(p_recurrence_config->'weekdays') loop
   if jsonb_typeof(item)<>'number' then raise exception 'Weekly recurrence weekdays must be integers 0 through 6'; end if;
   day_number=(item #>> '{}')::integer;
   if day_number<0 or day_number>6 then raise exception 'Weekly recurrence weekdays must be integers 0 through 6'; end if;
  end loop;
 elsif p_recurrence_unit='MONTH' then
  if p_recurrence_config is null or jsonb_typeof(p_recurrence_config->'monthDays')<>'array'
     or jsonb_array_length(p_recurrence_config->'monthDays')=0
  then raise exception 'Monthly recurrence requires at least one day of month'; end if;
  for item in select value from jsonb_array_elements(p_recurrence_config->'monthDays') loop
   if jsonb_typeof(item)<>'number' then raise exception 'Monthly recurrence days must be integers 1 through 31'; end if;
   day_number=(item #>> '{}')::integer;
   if day_number<1 or day_number>31 then raise exception 'Monthly recurrence days must be integers 1 through 31'; end if;
  end loop;
 elsif p_recurrence_config is not null and p_recurrence_config<>'{}'::jsonb then
  raise exception 'Recurrence configuration is only supported for WEEK and MONTH units';
 end if;
end $$;

create or replace function app_private.insert_schedule_tasks(
 p_schedule_id uuid,p_organization_id uuid,p_site_id uuid,p_work_area_id uuid,p_tasks jsonb
) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb; task_row public.task_master%rowtype; seq integer; duration_minutes integer;
 expected_sequence integer:=1; cursor_minutes integer:=0; evidence schedule_evidence_rule;
 random_n integer; random_type schedule_random_evidence_type;
begin
 if p_tasks is null or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)=0
 then raise exception 'Add at least one Task to the Schedule'; end if;
 for item in select value from jsonb_array_elements(p_tasks) order by ((value->>'sequence')::integer) loop
  seq=(item->>'sequence')::integer; duration_minutes=(item->>'plannedDurationMinutes')::integer;
  evidence=(item->>'evidenceRule')::schedule_evidence_rule;
  random_n=nullif(item->>'randomEveryN','')::integer;
  random_type=nullif(item->>'randomEvidenceType','')::schedule_random_evidence_type;
  if seq<>expected_sequence then raise exception 'Schedule Task sequence must be contiguous starting at 1'; end if;
  if duration_minutes<1 or duration_minutes>10080 then raise exception 'Task planned duration must be between 1 and 10080 minutes'; end if;
  if evidence='RANDOM' then
   if random_n is null or random_n<2 or random_n>1000 or random_type is null
   then raise exception 'Random evidence requires a frequency from 2 to 1000 and a media policy'; end if;
  else random_n=null; random_type=null; end if;
  select * into task_row from public.task_master where id=(item->>'taskId')::uuid;
  if task_row.id is null or task_row.organization_id<>p_organization_id or task_row.status<>'ACTIVE'
  then raise exception 'Every selected Task must be active and belong to this Organization'; end if;
  insert into public.schedule_task(
   organization_id,site_id,work_area_id,schedule_id,task_id,sequence,planned_duration_minutes,
   planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule,random_every_n,random_evidence_type
  ) values (
   p_organization_id,p_site_id,p_work_area_id,p_schedule_id,task_row.id,seq,duration_minutes,
   cursor_minutes,cursor_minutes+duration_minutes,evidence,random_n,random_type
  );
  cursor_minutes=cursor_minutes+duration_minutes; expected_sequence=expected_sequence+1;
 end loop;
end $$;

revoke all on function app_private.validate_schedule_recurrence(schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,date) from public;
revoke all on function app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb) from public;
grant execute on function app_private.validate_schedule_recurrence(schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,date) to vnext_runtime;
grant execute on function app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb) to vnext_runtime;

create or replace function app_private.create_schedule_master(
 p_work_area_id uuid,p_name text,p_document_reference text,p_document_revision text,
 p_frequency_type schedule_frequency_type,p_recurrence_unit schedule_recurrence_unit,p_recurrence_interval integer,
 p_recurrence_config jsonb,p_start_local_date date,p_start_local_time time without time zone,p_end_local_date date,
 p_tasks jsonb,p_idempotency_key text
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare org_id uuid:=app_private.current_organization_id(); wa public.work_area%rowtype; new_schedule_id uuid;
 schedule_timezone text; actor_name text; existing jsonb;
begin
 if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then raise exception 'ADMIN or SITE_MANAGER role is required'; end if;
 if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency key is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',org_id::text,'SCHEDULE_CREATE',trim(p_idempotency_key)),0));
 select result_json into existing from public.operation_idempotency
 where organization_id=org_id and operation_code='SCHEDULE_CREATE' and idempotency_key=trim(p_idempotency_key);
 if existing is not null then return (existing->>'scheduleId')::uuid; end if;
 if nullif(trim(p_name),'') is null or length(trim(p_name))>500
 then raise exception 'Schedule Name is required and must be 500 characters or fewer'; end if;
 select * into wa from public.work_area where id=p_work_area_id;
 if wa.id is null or wa.organization_id<>org_id or wa.status<>'ACTIVE' or not app_private.has_active_site_access(wa.site_id)
 then raise exception 'Schedules can only be created for an active Work Area under an active accessible Site'; end if;
 if not app_private.can_manage_schedule_site(wa.site_id) then raise exception 'Schedule management permission is required for this Site'; end if;
 select timezone into schedule_timezone from public.site where id=wa.site_id;
 if schedule_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=schedule_timezone)
 then raise exception 'Site must have a valid IANA timezone'; end if;
 perform app_private.validate_schedule_recurrence(p_frequency_type,p_recurrence_unit,p_recurrence_interval,p_recurrence_config,p_start_local_date,p_end_local_date);
 insert into public.schedule_master(
  organization_id,site_id,work_area_id,name,document_reference,document_revision,frequency_type,
  recurrence_unit,recurrence_interval,recurrence_config,start_local_date,start_local_time,timezone,end_local_date,status
 ) values (
  org_id,wa.site_id,wa.id,trim(p_name),nullif(trim(p_document_reference),''),nullif(trim(p_document_revision),''),
  p_frequency_type,case when p_frequency_type='RECURRING' then p_recurrence_unit else null end,
  case when p_frequency_type='RECURRING' then p_recurrence_interval else null end,
  case when p_frequency_type='RECURRING' then p_recurrence_config else null end,
  p_start_local_date,p_start_local_time,schedule_timezone,
  case when p_frequency_type='RECURRING' then p_end_local_date else null end,'ACTIVE'
 ) returning id into new_schedule_id;
 perform app_private.insert_schedule_tasks(new_schedule_id,org_id,wa.site_id,wa.id,p_tasks);
 insert into public.operation_idempotency(organization_id,operation_code,idempotency_key,result_json)
 values(org_id,'SCHEDULE_CREATE',trim(p_idempotency_key),jsonb_build_object('scheduleId',new_schedule_id));
 select display_name into actor_name from public.app_user where id=app_private.current_user_id();
 insert into public.audit_event(
  organization_id,actor_user_id,actor_membership_id,actor_display_name_snapshot,module_code,action_code,
  entity_type,entity_id,old_value_json,new_value_json,source_channel
 ) values (
  org_id,app_private.current_user_id(),app_private.current_membership_id(),actor_name,'SCHEDULE','SCHEDULE_CREATED',
  'Schedule',new_schedule_id::text,null,
  jsonb_build_object(
   'workAreaId',wa.id,'siteId',wa.site_id,'name',trim(p_name),
   'documentReference',nullif(trim(p_document_reference),''),'documentRevision',nullif(trim(p_document_revision),''),
   'frequencyType',p_frequency_type,'recurrenceUnit',case when p_frequency_type='RECURRING' then p_recurrence_unit else null end,
   'recurrenceInterval',case when p_frequency_type='RECURRING' then p_recurrence_interval else null end,
   'recurrenceConfig',case when p_frequency_type='RECURRING' then p_recurrence_config else null end,
   'startLocalDate',p_start_local_date,'startLocalTime',p_start_local_time,'timezone',schedule_timezone,
   'endLocalDate',case when p_frequency_type='RECURRING' then p_end_local_date else null end,
   'status','ACTIVE','tasks',p_tasks,'version',1
  ),'WEB'
 );
 return new_schedule_id;
end $$;

create or replace function app_private.update_schedule_master(
 p_schedule_id uuid,p_work_area_id uuid,p_name text,p_document_reference text,p_document_revision text,
 p_frequency_type schedule_frequency_type,p_recurrence_unit schedule_recurrence_unit,p_recurrence_interval integer,
 p_recurrence_config jsonb,p_start_local_date date,p_start_local_time time without time zone,p_end_local_date date,
 p_tasks jsonb,p_expected_version bigint
) returns bigint language plpgsql security invoker set search_path=pg_catalog,public as $$
declare org_id uuid:=app_private.current_organization_id(); old_row public.schedule_master%rowtype; wa public.work_area%rowtype;
 schedule_timezone text; old_tasks jsonb; new_version bigint; actor_name text;
begin
 if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then raise exception 'ADMIN or SITE_MANAGER role is required'; end if;
 if nullif(trim(p_name),'') is null or length(trim(p_name))>500 then raise exception 'Schedule Name is required and must be 500 characters or fewer'; end if;
 select * into old_row from public.schedule_master where id=p_schedule_id for update;
 if old_row.id is null or old_row.organization_id<>org_id then raise exception 'Schedule not found'; end if;
 if old_row.version<>p_expected_version then raise exception 'Schedule changed by another user; refresh and retry'; end if;
 if not app_private.can_manage_schedule_site(old_row.site_id) then raise exception 'Schedule management permission is required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'taskId',st.task_id,'sequence',st.sequence,'plannedDurationMinutes',st.planned_duration_minutes,
   'plannedStartOffsetMinutes',st.planned_start_offset_minutes,'plannedEndOffsetMinutes',st.planned_end_offset_minutes,
   'evidenceRule',st.evidence_rule,'randomEveryN',st.random_every_n,'randomEvidenceType',st.random_evidence_type
  ) order by st.sequence),'[]'::jsonb)
 into old_tasks from public.schedule_task st where st.schedule_id=old_row.id;
 select * into wa from public.work_area where id=p_work_area_id;
 if wa.id is null or wa.organization_id<>org_id or wa.status<>'ACTIVE'
    or not app_private.has_active_site_access(wa.site_id) or not app_private.can_manage_schedule_site(wa.site_id)
 then raise exception 'Schedule edits require an active Work Area in an active accessible Site'; end if;
 select timezone into schedule_timezone from public.site where id=wa.site_id;
 if schedule_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=schedule_timezone)
 then raise exception 'Site must have a valid IANA timezone'; end if;
 perform app_private.validate_schedule_recurrence(p_frequency_type,p_recurrence_unit,p_recurrence_interval,p_recurrence_config,p_start_local_date,p_end_local_date);
 update public.schedule_master set
  site_id=wa.site_id,work_area_id=wa.id,name=trim(p_name),document_reference=nullif(trim(p_document_reference),''),
  document_revision=nullif(trim(p_document_revision),''),frequency_type=p_frequency_type,
  recurrence_unit=case when p_frequency_type='RECURRING' then p_recurrence_unit else null end,
  recurrence_interval=case when p_frequency_type='RECURRING' then p_recurrence_interval else null end,
  recurrence_config=case when p_frequency_type='RECURRING' then p_recurrence_config else null end,
  start_local_date=p_start_local_date,start_local_time=p_start_local_time,timezone=schedule_timezone,
  end_local_date=case when p_frequency_type='RECURRING' then p_end_local_date else null end,
  updated_at=now(),version=version+1
 where id=old_row.id and version=p_expected_version returning version into new_version;
 if new_version is null then raise exception 'Schedule changed by another user; refresh and retry'; end if;
 delete from public.schedule_task where schedule_id=old_row.id;
 perform app_private.insert_schedule_tasks(old_row.id,org_id,wa.site_id,wa.id,p_tasks);
 select display_name into actor_name from public.app_user where id=app_private.current_user_id();
 insert into public.audit_event(
  organization_id,actor_user_id,actor_membership_id,actor_display_name_snapshot,module_code,action_code,
  entity_type,entity_id,old_value_json,new_value_json,source_channel
 ) values (
  org_id,app_private.current_user_id(),app_private.current_membership_id(),actor_name,'SCHEDULE','SCHEDULE_UPDATED',
  'Schedule',old_row.id::text,
  jsonb_build_object(
   'workAreaId',old_row.work_area_id,'siteId',old_row.site_id,'name',old_row.name,
   'documentReference',old_row.document_reference,'documentRevision',old_row.document_revision,
   'frequencyType',old_row.frequency_type,'recurrenceUnit',old_row.recurrence_unit,'recurrenceInterval',old_row.recurrence_interval,
   'recurrenceConfig',old_row.recurrence_config,'startLocalDate',old_row.start_local_date,'startLocalTime',old_row.start_local_time,
   'timezone',old_row.timezone,'endLocalDate',old_row.end_local_date,'status',old_row.status,'tasks',old_tasks,'version',old_row.version
  ),
  jsonb_build_object(
   'workAreaId',wa.id,'siteId',wa.site_id,'name',trim(p_name),
   'documentReference',nullif(trim(p_document_reference),''),'documentRevision',nullif(trim(p_document_revision),''),
   'frequencyType',p_frequency_type,'recurrenceUnit',case when p_frequency_type='RECURRING' then p_recurrence_unit else null end,
   'recurrenceInterval',case when p_frequency_type='RECURRING' then p_recurrence_interval else null end,
   'recurrenceConfig',case when p_frequency_type='RECURRING' then p_recurrence_config else null end,
   'startLocalDate',p_start_local_date,'startLocalTime',p_start_local_time,'timezone',schedule_timezone,
   'endLocalDate',case when p_frequency_type='RECURRING' then p_end_local_date else null end,
   'status',old_row.status,'tasks',p_tasks,'version',new_version
  ),'WEB'
 );
 return new_version;
end $$;

create or replace function app_private.set_schedule_master_status(p_schedule_id uuid,p_status record_status,p_expected_version bigint)
returns bigint language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_row public.schedule_master%rowtype; wa public.work_area%rowtype; new_version bigint; actor_name text;
begin
 if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then raise exception 'ADMIN or SITE_MANAGER role is required'; end if;
 select * into old_row from public.schedule_master where id=p_schedule_id for update;
 if old_row.id is null then raise exception 'Schedule not found'; end if;
 if old_row.version<>p_expected_version then raise exception 'Schedule changed by another user; refresh and retry'; end if;
 if not app_private.can_manage_schedule_site(old_row.site_id) then raise exception 'Schedule management permission is required'; end if;
 if p_status='ACTIVE' then
  select * into wa from public.work_area where id=old_row.work_area_id;
  if wa.id is null or wa.status<>'ACTIVE' or not app_private.has_active_site_access(old_row.site_id)
  then raise exception 'Cannot reactivate a Schedule unless its Work Area and Site are active'; end if;
 end if;
 update public.schedule_master set status=p_status,updated_at=now(),version=version+1
 where id=old_row.id and version=p_expected_version returning version into new_version;
 if new_version is null then raise exception 'Schedule changed by another user; refresh and retry'; end if;
 select display_name into actor_name from public.app_user where id=app_private.current_user_id();
 insert into public.audit_event(
  organization_id,actor_user_id,actor_membership_id,actor_display_name_snapshot,module_code,action_code,
  entity_type,entity_id,old_value_json,new_value_json,source_channel
 ) values (
  old_row.organization_id,app_private.current_user_id(),app_private.current_membership_id(),actor_name,
  'SCHEDULE','SCHEDULE_STATUS_CHANGED','Schedule',old_row.id::text,
  jsonb_build_object('status',old_row.status,'version',old_row.version),
  jsonb_build_object('status',p_status,'version',new_version),'WEB'
 );
 return new_version;
end $$;

revoke all on function app_private.create_schedule_master(
 uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,text
) from public;
revoke all on function app_private.update_schedule_master(
 uuid,uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,bigint
) from public;
revoke all on function app_private.set_schedule_master_status(uuid,record_status,bigint) from public;
grant execute on function app_private.create_schedule_master(
 uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,text
) to vnext_runtime;
grant execute on function app_private.update_schedule_master(
 uuid,uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,bigint
) to vnext_runtime;
grant execute on function app_private.set_schedule_master_status(uuid,record_status,bigint) to vnext_runtime;

alter default privileges in schema public revoke all on tables from vnext_runtime;
alter default privileges in schema public revoke all on sequences from vnext_runtime;
