-- Occurrence Task Execution & Completion Foundation 01
-- Sequential snapshotted Task execution, server-authoritative completion,
-- partial completion, private evidence metadata boundary, and audit.
-- Production media upload/normalization remains deferred.

alter table public.schedule_occurrence_task
  add column if not exists actual_duration_seconds integer,
  add column if not exists execution_notes text,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text;

alter table public.schedule_occurrence
  add column if not exists actual_duration_seconds integer,
  add column if not exists completion_reason text;

do $$ begin
  alter table public.schedule_occurrence_task
    add constraint occurrence_task_actual_duration_nonnegative
    check (actual_duration_seconds is null or actual_duration_seconds >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_task
    add constraint occurrence_task_execution_notes_length
    check (execution_notes is null or length(execution_notes) <= 4000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_task
    add constraint occurrence_task_cancel_reason_length
    check (cancel_reason is null or length(cancel_reason) <= 1000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence
    add constraint occurrence_actual_duration_nonnegative
    check (actual_duration_seconds is null or actual_duration_seconds >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence
    add constraint occurrence_completion_reason_length
    check (completion_reason is null or length(completion_reason) <= 1000);
exception when duplicate_object then null; end $$;

-- Tenant-safe parent key for evidence metadata.
create unique index if not exists occurrence_task_execution_parent_uq
  on public.schedule_occurrence_task(organization_id,site_id,work_area_id,occurrence_id,id);

create table if not exists public.schedule_occurrence_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  site_id uuid not null,
  work_area_id uuid not null,
  occurrence_id uuid not null,
  occurrence_task_id uuid not null,
  evidence_type schedule_random_evidence_type not null,
  object_key text not null,
  content_type text,
  byte_size bigint,
  sha256_hex text,
  verification_status text not null default 'PENDING',
  created_by_membership_id uuid not null,
  captured_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint occurrence_evidence_task_fk
    foreign key (organization_id,site_id,work_area_id,occurrence_id,occurrence_task_id)
    references public.schedule_occurrence_task(organization_id,site_id,work_area_id,occurrence_id,id),
  constraint occurrence_evidence_membership_fk
    foreign key (organization_id,created_by_membership_id)
    references public.organization_membership(organization_id,id),
  constraint occurrence_evidence_object_key_uq unique(organization_id,object_key),
  constraint occurrence_evidence_byte_size_positive
    check (byte_size is null or byte_size > 0),
  constraint occurrence_evidence_sha256_shape
    check (sha256_hex is null or sha256_hex ~ '^[0-9a-fA-F]{64}$'),
  constraint occurrence_evidence_verification_status
    check (verification_status in ('PENDING','VERIFIED','REJECTED')),
  constraint occurrence_evidence_verified_shape
    check (
      (verification_status='VERIFIED' and verified_at is not null)
      or
      (verification_status<>'VERIFIED')
    )
);

create index if not exists occurrence_evidence_org_task_idx
  on public.schedule_occurrence_evidence(organization_id,occurrence_task_id,verification_status);

revoke all on public.schedule_occurrence_evidence
  from public,anon,authenticated,vnext_runtime;
grant select on public.schedule_occurrence_evidence to vnext_runtime;

alter table public.schedule_occurrence_evidence enable row level security;
alter table public.schedule_occurrence_evidence force row level security;

drop policy if exists schedule_occurrence_evidence_select on public.schedule_occurrence_evidence;
create policy schedule_occurrence_evidence_select on public.schedule_occurrence_evidence
for select to vnext_runtime
using (
  organization_id=app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and exists (
    select 1
    from public.schedule_occurrence o
    where o.id=schedule_occurrence_evidence.occurrence_id
      and o.organization_id=schedule_occurrence_evidence.organization_id
      and (
        app_private.current_role() in ('ADMIN','SITE_MANAGER')
        or (
          app_private.current_role()='USER'
          and o.assigned_membership_id=app_private.current_membership_id()
        )
      )
  )
);

create or replace function app_private.audit_occurrence_task_event(
  p_action_code text,
  p_occurrence_task_id uuid,
  p_occurrence_id uuid,
  p_old jsonb,
  p_new jsonb,
  p_reason text,
  p_source_channel text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  actor_name text;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if p_source_channel not in ('WEB','API','MOBILE') then
    raise exception 'Invalid source channel';
  end if;

  select display_name into actor_name
  from public.app_user
  where id=app_private.current_user_id();

  insert into public.audit_event(
    organization_id,actor_user_id,actor_membership_id,
    actor_display_name_snapshot,module_code,action_code,
    entity_type,entity_id,old_value_json,new_value_json,
    source_channel,reason
  ) values (
    org_id,app_private.current_user_id(),app_private.current_membership_id(),
    actor_name,'OCCURRENCE_TASK',p_action_code,
    'ScheduleOccurrenceTask',p_occurrence_task_id::text,
    coalesce(p_old,'{}'::jsonb)||jsonb_build_object('occurrenceId',p_occurrence_id),
    coalesce(p_new,'{}'::jsonb)||jsonb_build_object('occurrenceId',p_occurrence_id),
    p_source_channel,p_reason
  );
end;
$$;

-- Replace QR start only to add the initial Task-start audit. The execution
-- authorization, QR validation, locking and idempotency semantics remain 0013-compatible.
create or replace function app_private.start_occurrence_with_qr(
  p_occurrence_id uuid,
  p_qr_public_token text,
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
  qr public.work_area_qr%rowtype;
  existing jsonb;
  first_task public.schedule_occurrence_task%rowtype;
  old_json jsonb;
  new_json jsonb;
  task_old jsonb;
  task_new jsonb;
  v_now timestamptz:=now();
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    raise exception 'USER role is required to start work';
  end if;
  if nullif(trim(p_qr_public_token),'') is null then raise exception 'QR token is required'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency key is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'OCCURRENCE_START',trim(p_idempotency_key)),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where organization_id=org_id
    and operation_code='OCCURRENCE_START'
    and idempotency_key=trim(p_idempotency_key);

  if existing is not null then
    if (existing->>'occurrenceId')::uuid<>p_occurrence_id then
      raise exception 'Idempotency key belongs to another start';
    end if;
    return p_occurrence_id;
  end if;

  perform app_private.apply_due_supersession(p_source_channel);

  select * into occ
  from public.schedule_occurrence
  where id=p_occurrence_id and organization_id=org_id
  for update;

  if occ.id is null then raise exception 'Occurrence not found'; end if;
  if not app_private.has_site_scope(occ.site_id) then raise exception 'Site scope is required'; end if;
  if occ.status<>'PENDING' or occ.started_at is not null then
    raise exception 'Occurrence is not startable';
  end if;
  if occ.assigned_membership_id<>membership_id or occ.claimed_at is null then
    raise exception 'Occurrence must be claimed by the active membership first';
  end if;

  if not exists (
    select 1
    from public.site s
    join public.work_area w
      on w.id=occ.work_area_id
     and w.organization_id=occ.organization_id
     and w.site_id=occ.site_id
    join public.schedule_master sm
      on sm.id=occ.schedule_id
     and sm.organization_id=occ.organization_id
     and sm.site_id=occ.site_id
     and sm.work_area_id=occ.work_area_id
    where s.id=occ.site_id
      and s.organization_id=occ.organization_id
      and s.status='ACTIVE'
      and w.status='ACTIVE'
      and sm.status='ACTIVE'
  ) then
    raise exception 'Schedule, Site, or Work Area is no longer active';
  end if;

  select * into qr
  from public.work_area_qr q
  where q.organization_id=org_id
    and q.site_id=occ.site_id
    and q.work_area_id=occ.work_area_id
    and q.public_token=trim(p_qr_public_token)
    and q.status='ACTIVE'
  for share;

  if qr.id is null then
    raise exception 'Active QR does not match this Work Area';
  end if;

  old_json:=jsonb_build_object(
    'status',occ.status,
    'assignedMembershipId',occ.assigned_membership_id,
    'claimedAt',occ.claimed_at,
    'startedAt',occ.started_at
  );

  update public.schedule_occurrence
  set status='IN_PROGRESS',
      started_at=v_now,
      updated_at=v_now,
      version=version+1
  where id=occ.id and organization_id=org_id;

  select * into first_task
  from public.schedule_occurrence_task
  where organization_id=org_id
    and occurrence_id=occ.id
    and status='PENDING'
  order by sequence
  limit 1
  for update;

  if first_task.id is not null then
    task_old:=jsonb_build_object(
      'status',first_task.status,
      'sequence',first_task.sequence,
      'startedAt',first_task.started_at
    );

    update public.schedule_occurrence_task
    set status='IN_PROGRESS',started_at=v_now,updated_at=v_now,version=version+1
    where id=first_task.id and organization_id=org_id;

    task_new:=jsonb_build_object(
      'status','IN_PROGRESS',
      'sequence',first_task.sequence,
      'startedAt',v_now
    );

    perform app_private.audit_occurrence_task_event(
      'OCCURRENCE_TASK_STARTED',first_task.id,occ.id,task_old,task_new,null,p_source_channel
    );
  end if;

  select * into occ
  from public.schedule_occurrence
  where id=p_occurrence_id and organization_id=org_id;

  new_json:=jsonb_build_object(
    'status',occ.status,
    'assignedMembershipId',occ.assigned_membership_id,
    'claimedAt',occ.claimed_at,
    'startedAt',occ.started_at,
    'qrId',qr.id,
    'workAreaId',occ.work_area_id
  );

  perform app_private.audit_execution_event(
    'OCCURRENCE_STARTED',occ.id,old_json,new_json,null,p_source_channel
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    org_id,'OCCURRENCE_START',trim(p_idempotency_key),
    jsonb_build_object('occurrenceId',occ.id,'qrId',qr.id)
  );

  return occ.id;
end;
$$;

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
    if (existing->>'occurrenceTaskId')::uuid<>p_occurrence_task_id then
      raise exception 'Idempotency key belongs to another Task completion';
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
    jsonb_build_object('occurrenceTaskId',task_row.id,'occurrenceId',occ.id)
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
    if (existing->>'occurrenceId')::uuid<>p_occurrence_id then
      raise exception 'Idempotency key belongs to another partial completion';
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
    jsonb_build_object('occurrenceId',occ.id)
  );

  return occ.id;
end;
$$;

revoke all on function app_private.audit_occurrence_task_event(text,uuid,uuid,jsonb,jsonb,text,text)
  from public,vnext_runtime;
revoke all on function app_private.complete_occurrence_task(uuid,bigint,text,text,text)
  from public,anon,authenticated;
revoke all on function app_private.partially_complete_occurrence(uuid,bigint,text,text,text)
  from public,anon,authenticated;

grant execute on function app_private.complete_occurrence_task(uuid,bigint,text,text,text)
  to vnext_runtime;
grant execute on function app_private.partially_complete_occurrence(uuid,bigint,text,text,text)
  to vnext_runtime;

-- Keep the 0013 public start command grant after replacement.
revoke all on function app_private.start_occurrence_with_qr(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function app_private.start_occurrence_with_qr(uuid,text,text,text)
  to vnext_runtime;
