-- Occurrence Execution & Supersession Foundation 01
-- My Work ranking, safe USER claim, QR-validated start, active-work exclusivity,
-- and latest-due-wins supersession. Full completion/evidence/mobile UI remains deferred.

-- Tenant-safe membership parent keys for execution assignment references.
create unique index if not exists organization_membership_org_id_uq
  on public.organization_membership(organization_id,id);

do $$ begin
  alter table public.schedule_occurrence
    add constraint schedule_occurrence_org_assigned_membership_fk
    foreign key (organization_id,assigned_membership_id)
    references public.organization_membership(organization_id,id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_task
    add constraint occurrence_task_org_completed_membership_fk
    foreign key (organization_id,completed_by_membership_id)
    references public.organization_membership(organization_id,id);
exception when duplicate_object then null; end $$;

-- A membership may hold only one actively claimed or IN_PROGRESS occurrence
-- inside one Organization. Future pre-assignment remains possible when claimed_at is NULL.
create unique index if not exists schedule_occurrence_one_active_membership_uq
  on public.schedule_occurrence(organization_id,assigned_membership_id)
  where assigned_membership_id is not null
    and status in ('PENDING','IN_PROGRESS')
    and (claimed_at is not null or status='IN_PROGRESS');

-- USER occurrence visibility is executable-work scoped. Management roles retain
-- Site-scoped planning/history visibility.
drop policy if exists schedule_occurrence_select on public.schedule_occurrence;
create policy schedule_occurrence_select on public.schedule_occurrence
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and (
    app_private.current_role() in ('ADMIN','SITE_MANAGER')
    or (
      app_private.current_role()='USER'
      and (
        assigned_membership_id=app_private.current_membership_id()
        or (status='PENDING' and assigned_membership_id is null)
      )
    )
  )
);

drop policy if exists schedule_occurrence_task_select on public.schedule_occurrence_task;
create policy schedule_occurrence_task_select on public.schedule_occurrence_task
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and exists (
    select 1
    from public.schedule_occurrence o
    where o.id=schedule_occurrence_task.occurrence_id
      and o.organization_id=schedule_occurrence_task.organization_id
      and (
        app_private.current_role() in ('ADMIN','SITE_MANAGER')
        or (
          app_private.current_role()='USER'
          and (
            o.assigned_membership_id=app_private.current_membership_id()
            or (o.status='PENDING' and o.assigned_membership_id is null)
          )
        )
      )
  )
);

create or replace function app_private.audit_execution_event(
  p_action_code text,
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
    actor_name,'OCCURRENCE',p_action_code,
    'ScheduleOccurrence',p_occurrence_id::text,p_old,p_new,
    p_source_channel,p_reason
  );
end;
$$;

create or replace function app_private.supersede_older_due_occurrences_internal(
  p_schedule_id uuid,
  p_latest_due_start timestamptz,
  p_source_channel text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  old_occ record;
  changed integer:=0;
  old_json jsonb;
  new_json jsonb;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if p_latest_due_start is null or p_latest_due_start>now() then return 0; end if;

  for old_occ in
    select o.*
    from public.schedule_occurrence o
    where o.organization_id=org_id
      and o.schedule_id=p_schedule_id
      and o.supersede_unstarted_snapshot=true
      and o.status='PENDING'
      and o.started_at is null
      and o.scheduled_start_utc<p_latest_due_start
      and o.scheduled_start_utc<=now()
    order by o.scheduled_start_utc
    for update
  loop
    old_json:=jsonb_build_object(
      'status',old_occ.status,
      'assignedMembershipId',old_occ.assigned_membership_id,
      'claimedAt',old_occ.claimed_at,
      'scheduledStartUtc',old_occ.scheduled_start_utc
    );

    update public.schedule_occurrence
    set status='MISSED',
        missed_at=now(),
        miss_reason='SUPERSEDED_BY_LATER_DUE',
        assigned_membership_id=null,
        claimed_at=null,
        updated_at=now(),
        version=version+1
    where id=old_occ.id
      and organization_id=org_id
      and status='PENDING'
      and started_at is null;

    if found then
      update public.schedule_occurrence_task
      set status='MISSED',updated_at=now(),version=version+1
      where organization_id=org_id
        and occurrence_id=old_occ.id
        and status='PENDING';

      new_json:=jsonb_build_object(
        'status','MISSED',
        'assignedMembershipId',null,
        'claimedAt',null,
        'missReason','SUPERSEDED_BY_LATER_DUE'
      );

      perform app_private.audit_execution_event(
        'OCCURRENCE_SUPERSEDED',old_occ.id,old_json,new_json,
        'Latest due occurrence wins',p_source_channel
      );
      changed:=changed+1;
    end if;
  end loop;

  return changed;
end;
$$;

-- Called before My Work reads and before claim/start commands. This is a
-- deliberate preparation command, not a passive read helper.
create or replace function app_private.apply_due_supersession(
  p_source_channel text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  latest record;
  changed integer:=0;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    return 0;
  end if;

  for latest in
    select distinct on (o.schedule_id)
      o.schedule_id,o.scheduled_start_utc
    from public.schedule_occurrence o
    where o.organization_id=org_id
      and o.status='PENDING'
      and o.started_at is null
      and o.supersede_unstarted_snapshot=true
      and o.scheduled_start_utc<=now()
      and app_private.has_site_scope(o.site_id)
    order by o.schedule_id,o.scheduled_start_utc desc
  loop
    changed:=changed+app_private.supersede_older_due_occurrences_internal(
      latest.schedule_id,latest.scheduled_start_utc,p_source_channel
    );
  end loop;

  return changed;
end;
$$;

create or replace function app_private.claim_occurrence(
  p_occurrence_id uuid,
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
  other_id uuid;
  old_json jsonb;
  new_json jsonb;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    raise exception 'USER role is required to claim work';
  end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'OCCURRENCE_CLAIM',trim(p_idempotency_key)),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where organization_id=org_id
    and operation_code='OCCURRENCE_CLAIM'
    and idempotency_key=trim(p_idempotency_key);

  if existing is not null then
    if (existing->>'occurrenceId')::uuid<>p_occurrence_id then
      raise exception 'Idempotency key belongs to another claim';
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
    raise exception 'Occurrence is not claimable';
  end if;
  if occ.assigned_membership_id is not null and occ.assigned_membership_id<>membership_id then
    raise exception 'Occurrence is assigned to another user';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'ACTIVE_WORK',membership_id::text),0
  ));

  select o.id into other_id
  from public.schedule_occurrence o
  where o.organization_id=org_id
    and o.assigned_membership_id=membership_id
    and o.id<>occ.id
    and o.status in ('PENDING','IN_PROGRESS')
    and (o.claimed_at is not null or o.status='IN_PROGRESS')
  limit 1
  for update;

  if other_id is not null then
    raise exception 'Another active work item is already held by this membership';
  end if;

  old_json:=jsonb_build_object(
    'status',occ.status,
    'assignedMembershipId',occ.assigned_membership_id,
    'claimedAt',occ.claimed_at
  );

  if occ.claimed_at is null then
    update public.schedule_occurrence
    set assigned_membership_id=membership_id,
        claimed_at=now(),
        updated_at=now(),
        version=version+1
    where id=occ.id and organization_id=org_id;

    select * into occ
    from public.schedule_occurrence
    where id=p_occurrence_id and organization_id=org_id;

    new_json:=jsonb_build_object(
      'status',occ.status,
      'assignedMembershipId',occ.assigned_membership_id,
      'claimedAt',occ.claimed_at
    );

    perform app_private.audit_execution_event(
      'OCCURRENCE_CLAIMED',occ.id,old_json,new_json,null,p_source_channel
    );
  end if;

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    org_id,'OCCURRENCE_CLAIM',trim(p_idempotency_key),
    jsonb_build_object('occurrenceId',occ.id)
  );

  return occ.id;
end;
$$;

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
  first_task_id uuid;
  old_json jsonb;
  new_json jsonb;
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
      started_at=now(),
      updated_at=now(),
      version=version+1
  where id=occ.id and organization_id=org_id;

  select id into first_task_id
  from public.schedule_occurrence_task
  where organization_id=org_id
    and occurrence_id=occ.id
    and status='PENDING'
  order by sequence
  limit 1
  for update;

  if first_task_id is not null then
    update public.schedule_occurrence_task
    set status='IN_PROGRESS',started_at=now(),updated_at=now(),version=version+1
    where id=first_task_id and organization_id=org_id;
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

revoke all on function app_private.audit_execution_event(text,uuid,jsonb,jsonb,text,text) from public,vnext_runtime;
revoke all on function app_private.supersede_older_due_occurrences_internal(uuid,timestamptz,text) from public,vnext_runtime;

revoke all on function app_private.apply_due_supersession(text) from public,anon,authenticated;
revoke all on function app_private.claim_occurrence(uuid,text,text) from public,anon,authenticated;
revoke all on function app_private.start_occurrence_with_qr(uuid,text,text,text) from public,anon,authenticated;

grant execute on function app_private.apply_due_supersession(text) to vnext_runtime;
grant execute on function app_private.claim_occurrence(uuid,text,text) to vnext_runtime;
grant execute on function app_private.start_occurrence_with_qr(uuid,text,text,text) to vnext_runtime;
