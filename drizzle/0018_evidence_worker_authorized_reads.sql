-- Evidence Processing Worker Queue & Authorized Reads Foundation 03A
-- Adds a least-privilege worker command boundary, leased outbox delivery,
-- original-deletion acknowledgement, and application-authorized evidence reads.
--
-- This migration intentionally does NOT create a LOGIN worker credential and
-- does NOT grant Storage access to a universal service credential. A separate
-- privileged capability-role setup is provided under supabase-privileged/.

alter table public.outbox_event
  add column if not exists worker_claim_token uuid,
  add column if not exists worker_id text,
  add column if not exists worker_lease_until timestamptz,
  add column if not exists last_attempt_at timestamptz;

do $$ begin
  alter table public.outbox_event
    add constraint outbox_worker_id_length
    check (worker_id is null or length(worker_id) between 1 and 200);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.outbox_event
    add constraint outbox_worker_claim_shape
    check (
      (worker_claim_token is null and worker_id is null and worker_lease_until is null)
      or
      (worker_claim_token is not null and worker_id is not null and worker_lease_until is not null)
    );
exception when duplicate_object then null; end $$;

create index if not exists outbox_evidence_worker_pending_idx
  on public.outbox_event(available_at,created_at,id)
  where processed_at is null
    and event_type in ('EVIDENCE_PROCESS_REQUESTED','EVIDENCE_ORIGINAL_DELETE_REQUESTED');

create or replace function app_private.claim_evidence_worker_event(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table(
  result_event_id uuid,
  result_organization_id uuid,
  result_event_type text,
  result_aggregate_id text,
  result_payload_json jsonb,
  result_claim_token uuid,
  result_lease_until timestamptz,
  result_attempt_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  picked public.outbox_event%rowtype;
  v_token uuid:=gen_random_uuid();
  v_lease timestamptz;
begin
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;
  if p_lease_seconds is null or p_lease_seconds<15 or p_lease_seconds>300 then
    raise exception 'Worker lease must be between 15 and 300 seconds';
  end if;
  v_lease:=now()+make_interval(secs=>p_lease_seconds);

  select * into picked
  from public.outbox_event o
  where o.processed_at is null
    and o.available_at<=now()
    and o.event_type in ('EVIDENCE_PROCESS_REQUESTED','EVIDENCE_ORIGINAL_DELETE_REQUESTED')
    and (o.worker_lease_until is null or o.worker_lease_until<=now())
  order by o.available_at,o.created_at,o.id
  for update skip locked
  limit 1;

  if picked.id is null then return; end if;

  update public.outbox_event
  set worker_claim_token=v_token,
      worker_id=clean_worker,
      worker_lease_until=v_lease,
      last_attempt_at=now(),
      attempt_count=attempt_count+1,
      last_error=null
  where id=picked.id;

  return query
  select picked.id,picked.organization_id,picked.event_type,picked.aggregate_id,
         picked.payload_json,v_token,v_lease,picked.attempt_count+1;
end;
$$;

create or replace function app_private.complete_evidence_worker_event(
  p_event_id uuid,
  p_claim_token uuid,
  p_worker_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  evt public.outbox_event%rowtype;
begin
  if p_event_id is null or p_claim_token is null then
    raise exception 'Worker event id and claim token are required';
  end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;

  select * into evt from public.outbox_event where id=p_event_id for update;
  if evt.id is null then raise exception 'Worker event not found'; end if;
  if evt.processed_at is not null then return evt.id; end if;
  if evt.worker_claim_token is distinct from p_claim_token
     or evt.worker_id is distinct from clean_worker then
    raise exception 'Worker event claim mismatch';
  end if;
  if evt.worker_lease_until is null or evt.worker_lease_until<=now() then
    raise exception 'Worker event lease has expired';
  end if;

  update public.outbox_event
  set processed_at=now(),
      worker_claim_token=null,
      worker_id=null,
      worker_lease_until=null,
      last_error=null
  where id=evt.id;

  return evt.id;
end;
$$;

create or replace function app_private.fail_evidence_worker_event(
  p_event_id uuid,
  p_claim_token uuid,
  p_worker_id text,
  p_error text,
  p_retry_after_seconds integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  clean_error text:=nullif(trim(coalesce(p_error,'')),'');
  evt public.outbox_event%rowtype;
begin
  if p_event_id is null or p_claim_token is null then
    raise exception 'Worker event id and claim token are required';
  end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;
  if clean_error is null or length(clean_error)>2000 then
    raise exception 'Worker error is required and cannot exceed 2000 characters';
  end if;
  if p_retry_after_seconds is null or p_retry_after_seconds<15 or p_retry_after_seconds>3600 then
    raise exception 'Retry delay must be between 15 and 3600 seconds';
  end if;

  select * into evt from public.outbox_event where id=p_event_id for update;
  if evt.id is null then raise exception 'Worker event not found'; end if;
  if evt.processed_at is not null then raise exception 'Worker event is already processed'; end if;
  if evt.worker_claim_token is distinct from p_claim_token
     or evt.worker_id is distinct from clean_worker then
    raise exception 'Worker event claim mismatch';
  end if;
  if evt.worker_lease_until is null or evt.worker_lease_until<=now() then
    raise exception 'Worker event lease has expired';
  end if;

  update public.outbox_event
  set available_at=now()+make_interval(secs=>p_retry_after_seconds),
      worker_claim_token=null,
      worker_id=null,
      worker_lease_until=null,
      last_error=clean_error
  where id=evt.id;

  return evt.id;
end;
$$;

create or replace function app_private.mark_evidence_original_deleted(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_object_key text,
  p_worker_id text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  e public.schedule_occurrence_evidence%rowtype;
  existing jsonb;
  clean_key text:=nullif(trim(coalesce(p_object_key,'')),'');
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  clean_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_next_version bigint;
begin
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Evidence version is required';
  end if;
  if clean_key is null then raise exception 'Original object key is required'; end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;
  if clean_idem is null then raise exception 'Idempotency key is required'; end if;

  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id
  for update;
  if e.id is null then raise exception 'Evidence not found'; end if;

  select result_json into existing
  from public.operation_idempotency
  where organization_id=e.organization_id
    and operation_code='EVIDENCE_ORIGINAL_DELETED'
    and idempotency_key=clean_idem;

  if existing is not null then
    if (existing->>'evidenceId')::uuid<>p_evidence_id
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'objectKey','')<>clean_key
       or coalesce(existing->>'workerId','')<>clean_worker
    then
      raise exception 'Idempotency key belongs to another original-deletion request';
    end if;
    return p_evidence_id;
  end if;

  if e.version<>p_expected_version then raise exception 'Evidence version conflict'; end if;
  if e.verification_status<>'VERIFIED' then
    raise exception 'Only VERIFIED Evidence may finalize original deletion';
  end if;
  if e.original_disposition<>'DELETE_QUEUED' then
    raise exception 'Evidence original is not queued for deletion';
  end if;
  if e.object_key<>clean_key then raise exception 'Original object key mismatch'; end if;

  v_next_version:=e.version+1;
  update public.schedule_occurrence_evidence
  set original_disposition='DELETED',
      updated_at=now(),
      version=v_next_version
  where id=e.id and version=p_expected_version;

  if not found then raise exception 'Evidence version conflict'; end if;

  insert into public.audit_event(
    organization_id,actor_user_id,actor_membership_id,
    actor_display_name_snapshot,module_code,action_code,
    entity_type,entity_id,old_value_json,new_value_json,
    source_channel,reason
  ) values (
    e.organization_id,null,null,clean_worker,
    'OCCURRENCE_EVIDENCE','OCCURRENCE_EVIDENCE_ORIGINAL_DELETED',
    'ScheduleOccurrenceEvidence',e.id::text,
    jsonb_build_object('originalDisposition',e.original_disposition,'version',e.version),
    jsonb_build_object('originalDisposition','DELETED','version',v_next_version),
    'WORKER',null
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    e.organization_id,'EVIDENCE_ORIGINAL_DELETED',clean_idem,
    jsonb_build_object(
      'evidenceId',e.id,
      'expectedVersion',p_expected_version,
      'objectKey',clean_key,
      'workerId',clean_worker
    )
  );

  return e.id;
end;
$$;

create or replace function app_private.authorize_occurrence_evidence_read(
  p_evidence_id uuid,
  p_variant text default 'BEST'
)
returns table(
  result_evidence_id uuid,
  result_storage_bucket text,
  result_object_key text,
  result_variant text,
  result_expires_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  membership_id uuid:=app_private.current_membership_id();
  role_code membership_role;
  e public.schedule_occurrence_evidence%rowtype;
  occ public.schedule_occurrence%rowtype;
  variant text:=upper(trim(coalesce(p_variant,'BEST')));
  selected_key text;
  selected_variant text;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if variant not in ('BEST','ORIGINAL','NORMALIZED','PREVIEW') then
    raise exception 'Invalid Evidence read variant';
  end if;

  role_code:=app_private.current_role();
  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id and organization_id=org_id;
  if e.id is null then raise exception 'Evidence not found'; end if;
  if not app_private.has_site_scope(e.site_id) then raise exception 'Site scope is required'; end if;
  if e.upload_status<>'UPLOADED' then raise exception 'Evidence is not uploaded'; end if;

  select * into occ
  from public.schedule_occurrence
  where id=e.occurrence_id and organization_id=org_id;
  if occ.id is null then raise exception 'Evidence Occurrence not found'; end if;

  if role_code not in ('ADMIN','SITE_MANAGER','USER') then
    raise exception 'Evidence read role is not permitted';
  end if;
  if role_code='USER' and occ.assigned_membership_id<>membership_id then
    raise exception 'USER may read only assigned Occurrence evidence';
  end if;

  if variant='ORIGINAL' then
    if e.original_disposition='DELETED' then raise exception 'Original Evidence object was deleted'; end if;
    selected_key:=e.object_key; selected_variant:='ORIGINAL';
  elsif variant='NORMALIZED' then
    if e.verification_status<>'VERIFIED' or e.normalized_object_key is null then
      raise exception 'Normalized Evidence is not available';
    end if;
    selected_key:=e.normalized_object_key; selected_variant:='NORMALIZED';
  elsif variant='PREVIEW' then
    if e.verification_status<>'VERIFIED' or e.preview_object_key is null then
      raise exception 'Evidence preview is not available';
    end if;
    selected_key:=e.preview_object_key; selected_variant:='PREVIEW';
  else
    if e.verification_status='VERIFIED' and e.preview_object_key is not null then
      selected_key:=e.preview_object_key; selected_variant:='PREVIEW';
    elsif e.verification_status='VERIFIED' and e.normalized_object_key is not null then
      selected_key:=e.normalized_object_key; selected_variant:='NORMALIZED';
    elsif e.original_disposition<>'DELETED' then
      selected_key:=e.object_key; selected_variant:='ORIGINAL';
    else
      raise exception 'No readable Evidence object is available';
    end if;
  end if;

  return query select e.id,e.storage_bucket,selected_key,selected_variant,60;
end;
$$;

create or replace function app_private.audit_evidence_read_url_issued(
  p_evidence_id uuid,
  p_object_key text,
  p_variant text,
  p_source_channel text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  auth record;
  actor_name text;
begin
  if p_source_channel not in ('WEB','API','MOBILE') then
    raise exception 'Invalid source channel';
  end if;

  select * into auth
  from app_private.authorize_occurrence_evidence_read(p_evidence_id,p_variant);
  if auth.result_evidence_id is null or auth.result_object_key<>p_object_key then
    raise exception 'Evidence read authorization mismatch';
  end if;

  select display_name into actor_name
  from public.app_user
  where id=app_private.current_user_id();

  insert into public.audit_event(
    organization_id,actor_user_id,actor_membership_id,
    actor_display_name_snapshot,module_code,action_code,
    entity_type,entity_id,new_value_json,source_channel
  ) values (
    app_private.current_organization_id(),
    app_private.current_user_id(),
    app_private.current_membership_id(),
    actor_name,
    'OCCURRENCE_EVIDENCE',
    'OCCURRENCE_EVIDENCE_READ_URL_ISSUED',
    'ScheduleOccurrenceEvidence',
    p_evidence_id::text,
    jsonb_build_object('variant',auth.result_variant,'expiresSeconds',auth.result_expires_seconds),
    p_source_channel
  );
end;
$$;

-- Application runtime: authorization + audit only.
revoke all on function app_private.authorize_occurrence_evidence_read(uuid,text)
  from public,anon,authenticated;
revoke all on function app_private.audit_evidence_read_url_issued(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function app_private.authorize_occurrence_evidence_read(uuid,text)
  to vnext_runtime;
grant execute on function app_private.audit_evidence_read_url_issued(uuid,text,text,text)
  to vnext_runtime;

-- Worker commands are never available to normal application/runtime roles.
revoke all on function app_private.claim_evidence_worker_event(text,integer)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.complete_evidence_worker_event(uuid,uuid,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.fail_evidence_worker_event(uuid,uuid,text,text,integer)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)
  from public,anon,authenticated,vnext_runtime;

-- Direct outbox mutation remains unavailable to both runtime and future worker roles.
revoke select,update,delete on public.outbox_event from vnext_runtime;
grant insert on public.outbox_event to vnext_runtime;
