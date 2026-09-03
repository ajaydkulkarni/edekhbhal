-- Occurrence Task Execution Idempotency Hardening 01
-- Migration 0015: bind idempotency keys to the full meaningful request.
-- Migration 0014 is already applied and must not be replayed.

create or replace function app_private.complete_occurrence_task(
  p_occurrence_task_id uuid,
  p_expected_version bigint,
  p_notes text,
  p_idempotency_key text,
  p_source_channel text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  membership_id uuid:=app_private.current_membership_id();
  task_row public.schedule_occurrence_task%rowtype;
  occ public.schedule_occurrence%rowtype;
  next_task public.schedule_occurrence_task%rowtype;
  existing jsonb;
  v_now timestamptz:=now();
  clean_notes text:=nullif(trim(coalesce(p_notes,'')),'');
  old_json jsonb;
  new_json jsonb;
  next_old jsonb;
  next_new jsonb;
  occurrence_old jsonb;
  occurrence_new jsonb;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    raise exception 'USER role is required to complete work';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Task version is required';
  end if;
  if clean_notes is not null and length(clean_notes)>4000 then
    raise exception 'Task notes cannot exceed 4000 characters';
  end if;
  if p_source_channel not in ('WEB','API','MOBILE') then
    raise exception 'Invalid source channel';
  end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'OCCURRENCE_TASK_COMPLETE',trim(p_idempotency_key)),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where organization_id=org_id
    and operation_code='OCCURRENCE_TASK_COMPLETE'
    and idempotency_key=trim(p_idempotency_key);

  if existing is not null then
    if (existing->>'occurrenceTaskId')::uuid<>p_occurrence_task_id
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'notes','')<>coalesce(clean_notes,'')
       or coalesce(existing->>'sourceChannel','')<>p_source_channel
    then
      raise exception 'Idempotency key belongs to another Task completion request';
    end if;
    return p_occurrence_task_id;
  end if;

  select * into task_row
  from public.schedule_occurrence_task
  where id=p_occurrence_task_id and organization_id=org_id
  for update;

  if task_row.id is null then raise exception 'Occurrence Task not found'; end if;
  if not app_private.has_site_scope(task_row.site_id) then raise exception 'Site scope is required'; end if;

  select * into occ
  from public.schedule_occurrence
  where id=task_row.occurrence_id and organization_id=org_id
  for update;

  if occ.id is null then raise exception 'Occurrence not found'; end if;
  if occ.status<>'IN_PROGRESS' or occ.started_at is null then
    raise exception 'Occurrence is not in progress';
  end if;
  if occ.assigned_membership_id<>membership_id then
    raise exception 'Only the active assigned membership may execute this Occurrence';
  end if;
  if task_row.status<>'IN_PROGRESS' or task_row.started_at is null then
    raise exception 'Only the current IN_PROGRESS Task may be completed';
  end if;
  if task_row.version<>p_expected_version then
    raise exception 'Occurrence Task version conflict';
  end if;

  if task_row.evidence_required and not exists (
    select 1
    from public.schedule_occurrence_evidence e
    where e.organization_id=org_id
      and e.occurrence_id=occ.id
      and e.occurrence_task_id=task_row.id
      and e.verification_status='VERIFIED'
      and e.evidence_type=task_row.required_evidence_type
  ) then
    raise exception 'Verified required evidence is missing for this Task';
  end if;

  old_json:=jsonb_build_object(
    'status',task_row.status,
    'startedAt',task_row.started_at,
    'completedAt',task_row.completed_at,
    'version',task_row.version
  );

  update public.schedule_occurrence_task
  set status='COMPLETED',
      completed_at=v_now,
      completed_by_membership_id=membership_id,
      actual_duration_seconds=greatest(0,floor(extract(epoch from (v_now-task_row.started_at)))::integer),
      execution_notes=clean_notes,
      updated_at=v_now,
      version=version+1
  where id=task_row.id
    and organization_id=org_id
    and status='IN_PROGRESS'
    and version=p_expected_version;

  if not found then raise exception 'Occurrence Task version conflict'; end if;

  select * into task_row
  from public.schedule_occurrence_task
  where id=p_occurrence_task_id and organization_id=org_id;

  new_json:=jsonb_build_object(
    'status',task_row.status,
    'startedAt',task_row.started_at,
    'completedAt',task_row.completed_at,
    'completedByMembershipId',task_row.completed_by_membership_id,
    'actualDurationSeconds',task_row.actual_duration_seconds,
    'notesRecorded',task_row.execution_notes is not null,
    'version',task_row.version
  );

  perform app_private.audit_occurrence_task_event(
    'OCCURRENCE_TASK_COMPLETED',task_row.id,occ.id,old_json,new_json,null,p_source_channel
  );

  select * into next_task
  from public.schedule_occurrence_task
  where organization_id=org_id
    and occurrence_id=occ.id
    and status='PENDING'
  order by sequence
  limit 1
  for update;

  occurrence_old:=jsonb_build_object(
    'status',occ.status,
    'completedAt',occ.completed_at,
    'version',occ.version
  );

  if next_task.id is not null then
    next_old:=jsonb_build_object(
      'status',next_task.status,
      'sequence',next_task.sequence,
      'startedAt',next_task.started_at,
      'version',next_task.version
    );

    update public.schedule_occurrence_task
    set status='IN_PROGRESS',started_at=v_now,updated_at=v_now,version=version+1
    where id=next_task.id and organization_id=org_id and status='PENDING';

    select * into next_task
    from public.schedule_occurrence_task
    where id=next_task.id and organization_id=org_id;

    next_new:=jsonb_build_object(
      'status',next_task.status,
      'sequence',next_task.sequence,
      'startedAt',next_task.started_at,
      'version',next_task.version
    );

    perform app_private.audit_occurrence_task_event(
      'OCCURRENCE_TASK_STARTED',next_task.id,occ.id,next_old,next_new,null,p_source_channel
    );

    update public.schedule_occurrence
    set updated_at=v_now,version=version+1
    where id=occ.id and organization_id=org_id and status='IN_PROGRESS';
  else
    if exists (
      select 1
      from public.schedule_occurrence_task t
      where t.organization_id=org_id
        and t.occurrence_id=occ.id
        and t.status<>'COMPLETED'
    ) then
      raise exception 'Occurrence has non-completed Tasks and cannot complete';
    end if;

    update public.schedule_occurrence
    set status='COMPLETED',
        completed_at=v_now,
        actual_duration_seconds=greatest(0,floor(extract(epoch from (v_now-occ.started_at)))::integer),
        completion_reason=null,
        updated_at=v_now,
        version=version+1
    where id=occ.id and organization_id=org_id and status='IN_PROGRESS';

    select * into occ
    from public.schedule_occurrence
    where id=occ.id and organization_id=org_id;

    occurrence_new:=jsonb_build_object(
      'status',occ.status,
      'completedAt',occ.completed_at,
      'actualDurationSeconds',occ.actual_duration_seconds,
      'version',occ.version
    );

    perform app_private.audit_execution_event(
      'OCCURRENCE_COMPLETED',occ.id,occurrence_old,occurrence_new,null,p_source_channel
    );
  end if;

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    org_id,'OCCURRENCE_TASK_COMPLETE',trim(p_idempotency_key),
    jsonb_build_object(
      'occurrenceTaskId',task_row.id,
      'occurrenceId',occ.id,
      'expectedVersion',p_expected_version,
      'notes',coalesce(clean_notes,''),
      'sourceChannel',p_source_channel
    )
  );

  return task_row.id;
end;
$$;

create or replace function app_private.partially_complete_occurrence(
  p_occurrence_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key text,
  p_source_channel text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  membership_id uuid:=app_private.current_membership_id();
  occ public.schedule_occurrence%rowtype;
  existing jsonb;
  v_now timestamptz:=now();
  clean_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  old_json jsonb;
  new_json jsonb;
  completed_count integer;
  remaining_count integer;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    raise exception 'USER role is required to complete work';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Occurrence version is required';
  end if;
  if clean_reason is null or length(clean_reason)<3 then
    raise exception 'Partial completion reason is required';
  end if;
  if length(clean_reason)>1000 then
    raise exception 'Partial completion reason cannot exceed 1000 characters';
  end if;
  if p_source_channel not in ('WEB','API','MOBILE') then
    raise exception 'Invalid source channel';
  end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'OCCURRENCE_PARTIAL_COMPLETE',trim(p_idempotency_key)),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where organization_id=org_id
    and operation_code='OCCURRENCE_PARTIAL_COMPLETE'
    and idempotency_key=trim(p_idempotency_key);

  if existing is not null then
    if (existing->>'occurrenceId')::uuid<>p_occurrence_id
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'reason','')<>clean_reason
       or coalesce(existing->>'sourceChannel','')<>p_source_channel
    then
      raise exception 'Idempotency key belongs to another partial completion request';
    end if;
    return p_occurrence_id;
  end if;

  select * into occ
  from public.schedule_occurrence
  where id=p_occurrence_id and organization_id=org_id
  for update;

  if occ.id is null then raise exception 'Occurrence not found'; end if;
  if not app_private.has_site_scope(occ.site_id) then raise exception 'Site scope is required'; end if;
  if occ.status<>'IN_PROGRESS' or occ.started_at is null then
    raise exception 'Occurrence is not in progress';
  end if;
  if occ.assigned_membership_id<>membership_id then
    raise exception 'Only the active assigned membership may complete this Occurrence';
  end if;
  if occ.version<>p_expected_version then
    raise exception 'Occurrence version conflict';
  end if;

  select
    count(*) filter (where status='COMPLETED')::integer,
    count(*) filter (where status<>'COMPLETED')::integer
  into completed_count,remaining_count
  from public.schedule_occurrence_task
  where organization_id=org_id and occurrence_id=occ.id;

  if completed_count<1 then
    raise exception 'At least one Task must be completed before partial completion';
  end if;
  if remaining_count<1 then
    raise exception 'All Tasks are already complete';
  end if;

  old_json:=jsonb_build_object(
    'status',occ.status,
    'completedAt',occ.completed_at,
    'version',occ.version
  );

  update public.schedule_occurrence_task
  set status='CANCELED',
      canceled_at=v_now,
      cancel_reason='PARTIAL_OCCURRENCE_COMPLETION',
      updated_at=v_now,
      version=version+1
  where organization_id=org_id
    and occurrence_id=occ.id
    and status in ('PENDING','IN_PROGRESS');

  update public.schedule_occurrence
  set status='PARTIALLY_COMPLETED',
      completed_at=v_now,
      actual_duration_seconds=greatest(0,floor(extract(epoch from (v_now-occ.started_at)))::integer),
      completion_reason=clean_reason,
      updated_at=v_now,
      version=version+1
  where id=occ.id
    and organization_id=org_id
    and status='IN_PROGRESS'
    and version=p_expected_version;

  if not found then raise exception 'Occurrence version conflict'; end if;

  select * into occ
  from public.schedule_occurrence
  where id=p_occurrence_id and organization_id=org_id;

  new_json:=jsonb_build_object(
    'status',occ.status,
    'completedAt',occ.completed_at,
    'actualDurationSeconds',occ.actual_duration_seconds,
    'completionReason',occ.completion_reason,
    'version',occ.version
  );

  perform app_private.audit_execution_event(
    'OCCURRENCE_PARTIALLY_COMPLETED',occ.id,old_json,new_json,clean_reason,p_source_channel
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    org_id,'OCCURRENCE_PARTIAL_COMPLETE',trim(p_idempotency_key),
    jsonb_build_object(
      'occurrenceId',occ.id,
      'expectedVersion',p_expected_version,
      'reason',clean_reason,
      'sourceChannel',p_source_channel
    )
  );

  return occ.id;
end;
$$;


revoke all on function app_private.complete_occurrence_task(uuid,bigint,text,text,text)
  from public,anon,authenticated;
revoke all on function app_private.partially_complete_occurrence(uuid,bigint,text,text,text)
  from public,anon,authenticated;

grant execute on function app_private.complete_occurrence_task(uuid,bigint,text,text,text)
  to vnext_runtime;
grant execute on function app_private.partially_complete_occurrence(uuid,bigint,text,text,text)
  to vnext_runtime;
