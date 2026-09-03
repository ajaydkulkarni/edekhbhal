-- Task + Schedule Command Boundary Hardening 01
-- Migration 0009
--
-- Goal:
--   Runtime may read tenant data through RLS, but meaningful Task/Schedule writes
--   must cross audited/versioned command functions. Direct runtime DML is revoked.
--   Command functions execute as SECURITY DEFINER only where explicit tenant
--   predicates make bypass-RLS ownership safe.

-- ---------------------------------------------------------------------------
-- Privilege boundary
-- ---------------------------------------------------------------------------

revoke insert, update on public.task_master from vnext_runtime;
grant select on public.task_master to vnext_runtime;

revoke insert, update on public.schedule_master from vnext_runtime;
grant select on public.schedule_master to vnext_runtime;

revoke insert, update, delete on public.schedule_task from vnext_runtime;
grant select on public.schedule_task to vnext_runtime;

revoke execute on function app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb) from vnext_runtime;

-- Creation functions already derive organization_id from transaction-local context
-- and constrain their target Work Area/idempotency rows to that organization.
alter function app_private.create_task_master(text,text,text) security definer;
alter function app_private.create_schedule_master(
  uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,
  jsonb,date,time without time zone,date,jsonb,text
) security definer;

-- The Schedule child-row helper is internal-only after the EXECUTE revoke above.
-- Its existing contract validates active same-Organization Tasks.
alter function app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb) security definer;

-- ---------------------------------------------------------------------------
-- Task update/status: explicit tenant predicates are mandatory because the
-- function owner may bypass RLS.
-- ---------------------------------------------------------------------------

create or replace function app_private.update_task_master(
  p_task_id uuid,
  p_name text,
  p_instructions_html text,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  old_row public.task_master%rowtype;
  new_version bigint;
  actor_name text;
  normalized_name text := trim(p_name);
  normalized_html text := coalesce(p_instructions_html, '');
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if not app_private.can_manage_tasks() then
    raise exception 'Task management permission is required';
  end if;
  if nullif(normalized_name, '') is null then
    raise exception 'Task name is required';
  end if;
  if length(normalized_name) > 160 then
    raise exception 'Task name is too long';
  end if;
  if length(normalized_html) > 50000 then
    raise exception 'Task instructions are too long';
  end if;

  select * into old_row
  from public.task_master
  where id = p_task_id
    and organization_id = org_id
  for update;

  if old_row.id is null then raise exception 'Task not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  update public.task_master
  set
    name = normalized_name,
    instructions_html = normalized_html,
    updated_at = now(),
    version = version + 1
  where id = p_task_id
    and organization_id = org_id
    and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  select display_name into actor_name
  from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    org_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'TASK', 'TASK_UPDATED',
    'Task', old_row.id::text,
    jsonb_build_object(
      'name', old_row.name,
      'instructionsHtml', old_row.instructions_html,
      'status', old_row.status,
      'version', old_row.version
    ),
    jsonb_build_object(
      'name', normalized_name,
      'instructionsHtml', normalized_html,
      'status', old_row.status,
      'version', new_version
    ),
    'WEB'
  );

  return new_version;
end;
$$;

create or replace function app_private.set_task_master_status(
  p_task_id uuid,
  p_status record_status,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  old_row public.task_master%rowtype;
  new_version bigint;
  actor_name text;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if not app_private.can_manage_tasks() then
    raise exception 'Task management permission is required';
  end if;

  select * into old_row
  from public.task_master
  where id = p_task_id
    and organization_id = org_id
  for update;

  if old_row.id is null then raise exception 'Task not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  update public.task_master
  set
    status = p_status,
    updated_at = now(),
    version = version + 1
  where id = p_task_id
    and organization_id = org_id
    and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  select display_name into actor_name
  from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    org_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'TASK', 'TASK_STATUS_CHANGED',
    'Task', old_row.id::text,
    jsonb_build_object(
      'name', old_row.name,
      'status', old_row.status,
      'version', old_row.version
    ),
    jsonb_build_object(
      'name', old_row.name,
      'status', p_status,
      'version', new_version
    ),
    'WEB'
  );

  return new_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule update/status: explicit organization predicates on every master/
-- child mutation and on target Work Area/Site lookups.
-- ---------------------------------------------------------------------------

create or replace function app_private.update_schedule_master(
  p_schedule_id uuid,p_work_area_id uuid,p_name text,p_document_reference text,p_document_revision text,
  p_frequency_type schedule_frequency_type,p_recurrence_unit schedule_recurrence_unit,p_recurrence_interval integer,
  p_recurrence_config jsonb,p_start_local_date date,p_start_local_time time without time zone,p_end_local_date date,
  p_tasks jsonb,p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  old_row public.schedule_master%rowtype;
  wa public.work_area%rowtype;
  schedule_timezone text;
  old_tasks jsonb;
  new_version bigint;
  actor_name text;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then
    raise exception 'ADMIN or SITE_MANAGER role is required';
  end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name)) > 500 then
    raise exception 'Schedule Name is required and must be 500 characters or fewer';
  end if;

  select * into old_row
  from public.schedule_master
  where id = p_schedule_id
    and organization_id = org_id
  for update;

  if old_row.id is null then raise exception 'Schedule not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Schedule changed by another user; refresh and retry';
  end if;
  if not app_private.can_manage_schedule_site(old_row.site_id) then
    raise exception 'Schedule management permission is required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'taskId',st.task_id,
      'sequence',st.sequence,
      'plannedDurationMinutes',st.planned_duration_minutes,
      'plannedStartOffsetMinutes',st.planned_start_offset_minutes,
      'plannedEndOffsetMinutes',st.planned_end_offset_minutes,
      'evidenceRule',st.evidence_rule,
      'randomEveryN',st.random_every_n,
      'randomEvidenceType',st.random_evidence_type
    ) order by st.sequence),'[]'::jsonb)
  into old_tasks
  from public.schedule_task st
  where st.schedule_id = old_row.id
    and st.organization_id = org_id;

  select * into wa
  from public.work_area
  where id = p_work_area_id
    and organization_id = org_id;

  if wa.id is null or wa.status <> 'ACTIVE'
     or not app_private.has_active_site_access(wa.site_id)
     or not app_private.can_manage_schedule_site(wa.site_id)
  then
    raise exception 'Schedule edits require an active Work Area in an active accessible Site';
  end if;

  select timezone into schedule_timezone
  from public.site
  where id = wa.site_id
    and organization_id = org_id;

  if schedule_timezone is null
     or not exists(select 1 from pg_catalog.pg_timezone_names where name = schedule_timezone)
  then
    raise exception 'Site must have a valid IANA timezone';
  end if;

  perform app_private.validate_schedule_recurrence(
    p_frequency_type,p_recurrence_unit,p_recurrence_interval,p_recurrence_config,
    p_start_local_date,p_end_local_date
  );

  update public.schedule_master
  set
    site_id = wa.site_id,
    work_area_id = wa.id,
    name = trim(p_name),
    document_reference = nullif(trim(p_document_reference),''),
    document_revision = nullif(trim(p_document_revision),''),
    frequency_type = p_frequency_type,
    recurrence_unit = case when p_frequency_type='RECURRING' then p_recurrence_unit else null end,
    recurrence_interval = case when p_frequency_type='RECURRING' then p_recurrence_interval else null end,
    recurrence_config = case when p_frequency_type='RECURRING' then p_recurrence_config else null end,
    start_local_date = p_start_local_date,
    start_local_time = p_start_local_time,
    timezone = schedule_timezone,
    end_local_date = case when p_frequency_type='RECURRING' then p_end_local_date else null end,
    updated_at = now(),
    version = version + 1
  where id = old_row.id
    and organization_id = org_id
    and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    raise exception 'Schedule changed by another user; refresh and retry';
  end if;

  delete from public.schedule_task
  where schedule_id = old_row.id
    and organization_id = org_id;

  perform app_private.insert_schedule_tasks(
    old_row.id,org_id,wa.site_id,wa.id,p_tasks
  );

  select display_name into actor_name
  from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id,actor_user_id,actor_membership_id,actor_display_name_snapshot,
    module_code,action_code,entity_type,entity_id,old_value_json,new_value_json,source_channel
  ) values (
    org_id,app_private.current_user_id(),app_private.current_membership_id(),actor_name,
    'SCHEDULE','SCHEDULE_UPDATED','Schedule',old_row.id::text,
    jsonb_build_object(
      'workAreaId',old_row.work_area_id,'siteId',old_row.site_id,'name',old_row.name,
      'documentReference',old_row.document_reference,'documentRevision',old_row.document_revision,
      'frequencyType',old_row.frequency_type,'recurrenceUnit',old_row.recurrence_unit,
      'recurrenceInterval',old_row.recurrence_interval,'recurrenceConfig',old_row.recurrence_config,
      'startLocalDate',old_row.start_local_date,'startLocalTime',old_row.start_local_time,
      'timezone',old_row.timezone,'endLocalDate',old_row.end_local_date,'status',old_row.status,
      'tasks',old_tasks,'version',old_row.version
    ),
    jsonb_build_object(
      'workAreaId',wa.id,'siteId',wa.site_id,'name',trim(p_name),
      'documentReference',nullif(trim(p_document_reference),''),
      'documentRevision',nullif(trim(p_document_revision),''),
      'frequencyType',p_frequency_type,
      'recurrenceUnit',case when p_frequency_type='RECURRING' then p_recurrence_unit else null end,
      'recurrenceInterval',case when p_frequency_type='RECURRING' then p_recurrence_interval else null end,
      'recurrenceConfig',case when p_frequency_type='RECURRING' then p_recurrence_config else null end,
      'startLocalDate',p_start_local_date,'startLocalTime',p_start_local_time,
      'timezone',schedule_timezone,
      'endLocalDate',case when p_frequency_type='RECURRING' then p_end_local_date else null end,
      'status',old_row.status,'tasks',p_tasks,'version',new_version
    ),
    'WEB'
  );

  return new_version;
end;
$$;

create or replace function app_private.set_schedule_master_status(
  p_schedule_id uuid,p_status record_status,p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  old_row public.schedule_master%rowtype;
  wa public.work_area%rowtype;
  new_version bigint;
  actor_name text;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then
    raise exception 'ADMIN or SITE_MANAGER role is required';
  end if;

  select * into old_row
  from public.schedule_master
  where id = p_schedule_id
    and organization_id = org_id
  for update;

  if old_row.id is null then raise exception 'Schedule not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Schedule changed by another user; refresh and retry';
  end if;
  if not app_private.can_manage_schedule_site(old_row.site_id) then
    raise exception 'Schedule management permission is required';
  end if;

  if p_status = 'ACTIVE' then
    select * into wa
    from public.work_area
    where id = old_row.work_area_id
      and organization_id = org_id;

    if wa.id is null or wa.status <> 'ACTIVE'
       or not app_private.has_active_site_access(old_row.site_id)
    then
      raise exception 'Cannot reactivate a Schedule unless its Work Area and Site are active';
    end if;
  end if;

  update public.schedule_master
  set status = p_status, updated_at = now(), version = version + 1
  where id = old_row.id
    and organization_id = org_id
    and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    raise exception 'Schedule changed by another user; refresh and retry';
  end if;

  select display_name into actor_name
  from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id,actor_user_id,actor_membership_id,actor_display_name_snapshot,
    module_code,action_code,entity_type,entity_id,old_value_json,new_value_json,source_channel
  ) values (
    org_id,app_private.current_user_id(),app_private.current_membership_id(),actor_name,
    'SCHEDULE','SCHEDULE_STATUS_CHANGED','Schedule',old_row.id::text,
    jsonb_build_object('status',old_row.status,'version',old_row.version),
    jsonb_build_object('status',p_status,'version',new_version),
    'WEB'
  );

  return new_version;
end;
$$;

-- Re-assert function exposure after replacement.
revoke all on function app_private.create_task_master(text,text,text) from public;
revoke all on function app_private.update_task_master(uuid,text,text,bigint) from public;
revoke all on function app_private.set_task_master_status(uuid,record_status,bigint) from public;

grant execute on function app_private.create_task_master(text,text,text) to vnext_runtime;
grant execute on function app_private.update_task_master(uuid,text,text,bigint) to vnext_runtime;
grant execute on function app_private.set_task_master_status(uuid,record_status,bigint) to vnext_runtime;

revoke all on function app_private.create_schedule_master(
  uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,
  jsonb,date,time without time zone,date,jsonb,text
) from public;
revoke all on function app_private.update_schedule_master(
  uuid,uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,
  jsonb,date,time without time zone,date,jsonb,bigint
) from public;
revoke all on function app_private.set_schedule_master_status(uuid,record_status,bigint) from public;

grant execute on function app_private.create_schedule_master(
  uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,
  jsonb,date,time without time zone,date,jsonb,text
) to vnext_runtime;
grant execute on function app_private.update_schedule_master(
  uuid,uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,
  jsonb,date,time without time zone,date,jsonb,bigint
) to vnext_runtime;
grant execute on function app_private.set_schedule_master_status(uuid,record_status,bigint) to vnext_runtime;

revoke all on function app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb) from public;
revoke execute on function app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb) from vnext_runtime;
