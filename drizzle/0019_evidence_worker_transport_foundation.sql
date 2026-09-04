-- Evidence Processing Worker Transport & Storage Authorization Foundation 03B1
-- Portable worker transport contract, bounded lease heartbeats, server-issued
-- derivative targets, and machine-principal Storage authorization helpers.
--
-- IMPORTANT:
-- - This migration does NOT create a LOGIN database credential.
-- - This migration does NOT create a Supabase Auth machine user.
-- - This migration does NOT introduce a service-role/secret API key or S3 key.
-- - Supabase Storage policies remain a separate privileged setup.
-- - Real image/video codecs remain Foundation 03B2.

create table if not exists app_private.evidence_worker_storage_principal (
  auth_subject uuid primary key,
  worker_id text not null unique,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_worker_storage_principal_worker_id_length
    check (length(worker_id) between 1 and 200),
  constraint evidence_worker_storage_principal_status
    check (status in ('ACTIVE','INACTIVE'))
);

revoke all on table app_private.evidence_worker_storage_principal
  from public,anon,authenticated,vnext_runtime;

create or replace function app_private.assert_evidence_worker_storage_principal(
  p_auth_subject uuid,
  p_worker_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from app_private.evidence_worker_storage_principal p
    where p.auth_subject=p_auth_subject
      and p.worker_id=nullif(trim(coalesce(p_worker_id,'')),'')
      and p.status='ACTIVE'
  )
$$;

create or replace function app_private.renew_evidence_worker_event_lease(
  p_event_id uuid,
  p_claim_token uuid,
  p_worker_id text,
  p_lease_seconds integer default 90
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  evt public.outbox_event%rowtype;
  v_lease timestamptz;
begin
  if p_event_id is null or p_claim_token is null then
    raise exception 'Worker event id and claim token are required';
  end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;
  if p_lease_seconds is null or p_lease_seconds<15 or p_lease_seconds>300 then
    raise exception 'Worker lease must be between 15 and 300 seconds';
  end if;

  select * into evt
  from public.outbox_event
  where id=p_event_id
  for update;

  if evt.id is null then raise exception 'Worker event not found'; end if;
  if evt.processed_at is not null then raise exception 'Worker event is already processed'; end if;
  if evt.event_type not in ('EVIDENCE_PROCESS_REQUESTED','EVIDENCE_ORIGINAL_DELETE_REQUESTED') then
    raise exception 'Worker event type is not an Evidence worker event';
  end if;
  if evt.worker_claim_token is distinct from p_claim_token
     or evt.worker_id is distinct from clean_worker then
    raise exception 'Worker event claim mismatch';
  end if;
  if evt.worker_lease_until is null or evt.worker_lease_until<=now() then
    raise exception 'Worker event lease has expired';
  end if;

  v_lease:=now()+make_interval(secs=>p_lease_seconds);
  update public.outbox_event
  set worker_lease_until=v_lease
  where id=evt.id;

  return v_lease;
end;
$$;

create or replace function app_private.renew_evidence_processing_lease(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_claim_token uuid,
  p_processor_id text,
  p_lease_seconds integer default 300
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_processor text:=nullif(trim(coalesce(p_processor_id,'')),'');
  e public.schedule_occurrence_evidence%rowtype;
  v_lease timestamptz;
begin
  if p_evidence_id is null or p_claim_token is null then
    raise exception 'Evidence id and processing claim token are required';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Evidence version is required';
  end if;
  if clean_processor is null or length(clean_processor)>200 then
    raise exception 'Processor id is required and cannot exceed 200 characters';
  end if;
  if p_lease_seconds is null or p_lease_seconds<60 or p_lease_seconds>300 then
    raise exception 'Processing lease must be between 60 and 300 seconds';
  end if;

  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id
  for update;

  if e.id is null then raise exception 'Evidence not found'; end if;
  if e.version<>p_expected_version then raise exception 'Evidence version conflict'; end if;
  if e.processing_status<>'PROCESSING' then raise exception 'Evidence is not being processed'; end if;
  if e.processing_claim_token is distinct from p_claim_token then
    raise exception 'Processing claim token mismatch';
  end if;
  if e.processor_id is distinct from clean_processor then
    raise exception 'Processing claim belongs to another processor';
  end if;
  if e.processing_lease_until is null or e.processing_lease_until<=now() then
    raise exception 'Evidence processing lease has expired';
  end if;

  v_lease:=now()+make_interval(secs=>p_lease_seconds);
  update public.schedule_occurrence_evidence
  set processing_lease_until=v_lease,
      updated_at=now()
  where id=e.id and version=p_expected_version;

  return v_lease;
end;
$$;

create or replace function app_private.get_evidence_processing_targets(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_claim_token uuid,
  p_processor_id text
)
returns table(
  result_normalized_object_key text,
  result_normalized_content_type text,
  result_preview_object_key text,
  result_preview_content_type text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_processor text:=nullif(trim(coalesce(p_processor_id,'')),'');
  e public.schedule_occurrence_evidence%rowtype;
  base_key text;
begin
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Evidence version is required';
  end if;
  if p_claim_token is null then raise exception 'Processing claim token is required'; end if;
  if clean_processor is null or length(clean_processor)>200 then
    raise exception 'Processor id is required and cannot exceed 200 characters';
  end if;

  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id;

  if e.id is null then raise exception 'Evidence not found'; end if;
  if e.version<>p_expected_version then raise exception 'Evidence version conflict'; end if;
  if e.processing_status<>'PROCESSING' then raise exception 'Evidence is not being processed'; end if;
  if e.processing_claim_token is distinct from p_claim_token then
    raise exception 'Processing claim token mismatch';
  end if;
  if e.processor_id is distinct from clean_processor then
    raise exception 'Processing claim belongs to another processor';
  end if;
  if e.processing_lease_until is null or e.processing_lease_until<=now() then
    raise exception 'Evidence processing lease has expired';
  end if;

  base_key:=concat_ws(
    '/',
    e.organization_id::text,
    e.occurrence_id::text,
    e.occurrence_task_id::text,
    e.id::text
  )||'/';

  if e.evidence_type='PHOTO' then
    return query select
      base_key||'normalized.webp',
      'image/webp'::text,
      base_key||'preview.webp',
      'image/webp'::text;
  elsif e.evidence_type='VIDEO' then
    return query select
      base_key||'normalized.mp4',
      'video/mp4'::text,
      base_key||'preview.jpg',
      'image/jpeg'::text;
  else
    raise exception 'Unsupported Evidence type for normalization';
  end if;
end;
$$;

create or replace function app_private.complete_evidence_processing_transport(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_claim_token uuid,
  p_processor_id text,
  p_result text,
  p_observed_content_type text,
  p_observed_byte_size bigint,
  p_observed_sha256_hex text,
  p_normalized_byte_size bigint,
  p_retain_original boolean,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_result text:=upper(trim(coalesce(p_result,'')));
  targets record;
begin
  if clean_result not in ('VERIFIED','REJECTED') then
    raise exception 'Processing result must be VERIFIED or REJECTED';
  end if;

  select * into targets
  from app_private.get_evidence_processing_targets(
    p_evidence_id,p_expected_version,p_claim_token,p_processor_id
  );

  return app_private.complete_evidence_processing(
    p_evidence_id,
    p_expected_version,
    p_claim_token,
    p_processor_id,
    clean_result,
    p_observed_content_type,
    p_observed_byte_size,
    p_observed_sha256_hex,
    case when clean_result='VERIFIED' then targets.result_normalized_object_key else null end,
    case when clean_result='VERIFIED' then targets.result_normalized_content_type else null end,
    case when clean_result='VERIFIED' then p_normalized_byte_size else null end,
    case when clean_result='VERIFIED' then targets.result_preview_object_key else null end,
    p_retain_original,
    p_reason,
    p_idempotency_key
  );
end;
$$;

-- Supabase Storage requests do not carry app.* transaction context. These
-- helpers bind an authenticated machine principal to the worker id and then
-- require a live Evidence outbox lease plus, for processing, the live Evidence
-- processing lease. They return only booleans to Storage RLS.
create or replace function public.storage_worker_can_read_occurrence_evidence(
  p_bucket_id text,
  p_object_name text,
  p_auth_subject text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.schedule_occurrence_evidence e
    join app_private.evidence_worker_storage_principal p
      on p.auth_subject::text=p_auth_subject
     and p.status='ACTIVE'
     and p.worker_id=e.processor_id
    where e.storage_bucket=p_bucket_id
      and e.upload_status='UPLOADED'
      and e.verification_status='PENDING'
      and e.processing_status='PROCESSING'
      and e.processing_lease_until>now()
      and (
        (e.evidence_type='PHOTO' and p_object_name in (
          e.object_key,
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'normalized.webp'),
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'preview.webp')
        ))
        or
        (e.evidence_type='VIDEO' and p_object_name in (
          e.object_key,
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'normalized.mp4'),
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'preview.jpg')
        ))
      )
      and exists (
        select 1
        from public.outbox_event evt
        where evt.event_type='EVIDENCE_PROCESS_REQUESTED'
          and evt.aggregate_type='ScheduleOccurrenceEvidence'
          and evt.aggregate_id=e.id::text
          and evt.organization_id=e.organization_id
          and evt.processed_at is null
          and evt.worker_claim_token is not null
          and evt.worker_id=p.worker_id
          and evt.worker_lease_until>now()
      )
  )
$$;

create or replace function public.storage_worker_can_write_occurrence_evidence(
  p_bucket_id text,
  p_object_name text,
  p_auth_subject text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.schedule_occurrence_evidence e
    join app_private.evidence_worker_storage_principal p
      on p.auth_subject::text=p_auth_subject
     and p.status='ACTIVE'
     and p.worker_id=e.processor_id
    where e.storage_bucket=p_bucket_id
      and e.upload_status='UPLOADED'
      and e.verification_status='PENDING'
      and e.processing_status='PROCESSING'
      and e.processing_lease_until>now()
      and (
        (e.evidence_type='PHOTO' and p_object_name in (
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'normalized.webp'),
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'preview.webp')
        ))
        or
        (e.evidence_type='VIDEO' and p_object_name in (
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'normalized.mp4'),
          concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'preview.jpg')
        ))
      )
      and exists (
        select 1
        from public.outbox_event evt
        where evt.event_type='EVIDENCE_PROCESS_REQUESTED'
          and evt.aggregate_type='ScheduleOccurrenceEvidence'
          and evt.aggregate_id=e.id::text
          and evt.organization_id=e.organization_id
          and evt.processed_at is null
          and evt.worker_claim_token is not null
          and evt.worker_id=p.worker_id
          and evt.worker_lease_until>now()
      )
  )
$$;

create or replace function public.storage_worker_can_delete_occurrence_evidence(
  p_bucket_id text,
  p_object_name text,
  p_auth_subject text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.schedule_occurrence_evidence e
    join app_private.evidence_worker_storage_principal p
      on p.auth_subject::text=p_auth_subject
     and p.status='ACTIVE'
    where e.storage_bucket=p_bucket_id
      and (
        (
          p.worker_id=e.processor_id
          and e.upload_status='UPLOADED'
          and e.verification_status='PENDING'
          and e.processing_status='PROCESSING'
          and e.processing_lease_until>now()
          and (
            (e.evidence_type='PHOTO' and p_object_name in (
              concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'normalized.webp'),
              concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'preview.webp')
            ))
            or
            (e.evidence_type='VIDEO' and p_object_name in (
              concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'normalized.mp4'),
              concat_ws('/',e.organization_id::text,e.occurrence_id::text,e.occurrence_task_id::text,e.id::text,'preview.jpg')
            ))
          )
          and exists (
            select 1 from public.outbox_event evt
            where evt.event_type='EVIDENCE_PROCESS_REQUESTED'
              and evt.aggregate_type='ScheduleOccurrenceEvidence'
              and evt.aggregate_id=e.id::text
              and evt.organization_id=e.organization_id
              and evt.processed_at is null
              and evt.worker_claim_token is not null
              and evt.worker_id=p.worker_id
              and evt.worker_lease_until>now()
          )
        )
        or
        (
          e.verification_status='VERIFIED'
          and e.original_disposition='DELETE_QUEUED'
          and p_object_name=e.object_key
          and exists (
            select 1 from public.outbox_event evt
            where evt.event_type='EVIDENCE_ORIGINAL_DELETE_REQUESTED'
              and evt.aggregate_type='ScheduleOccurrenceEvidence'
              and evt.aggregate_id=e.id::text
              and evt.organization_id=e.organization_id
              and evt.processed_at is null
              and evt.worker_claim_token is not null
              and evt.worker_id=p.worker_id
              and evt.worker_lease_until>now()
          )
        )
      )
  )
$$;

revoke all on function app_private.assert_evidence_worker_storage_principal(uuid,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.renew_evidence_worker_event_lease(uuid,uuid,text,integer)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.renew_evidence_processing_lease(uuid,bigint,uuid,text,integer)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.get_evidence_processing_targets(uuid,bigint,uuid,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.complete_evidence_processing_transport(
  uuid,bigint,uuid,text,text,text,bigint,text,bigint,boolean,text,text
) from public,anon,authenticated,vnext_runtime;

revoke all on function public.storage_worker_can_read_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
revoke all on function public.storage_worker_can_write_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
revoke all on function public.storage_worker_can_delete_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
grant execute on function public.storage_worker_can_read_occurrence_evidence(text,text,text)
  to authenticated;
grant execute on function public.storage_worker_can_write_occurrence_evidence(text,text,text)
  to authenticated;
grant execute on function public.storage_worker_can_delete_occurrence_evidence(text,text,text)
  to authenticated;
