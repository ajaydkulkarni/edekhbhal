-- Evidence Verification & Media Normalization Foundation 02
-- Trusted processor lifecycle and transactional handoff.
--
-- IMPORTANT:
-- - This migration does not create or grant a universal worker credential.
-- - Processor command functions are intentionally not executable by vnext_runtime,
--   anon, authenticated, or public. A dedicated least-privilege worker identity
--   will be provisioned separately before a real media processor is deployed.
-- - No image/video codec is implemented by this migration.

alter table public.schedule_occurrence_evidence
  add column if not exists processing_status text not null default 'NOT_QUEUED',
  add column if not exists processing_requested_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists processing_lease_until timestamptz,
  add column if not exists processing_claim_token uuid,
  add column if not exists processor_id text,
  add column if not exists processing_attempt_count integer not null default 0,
  add column if not exists processing_error text,
  add column if not exists normalized_content_type text,
  add column if not exists normalized_byte_size bigint,
  add column if not exists original_disposition text not null default 'PENDING';

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_processing_status
    check (processing_status in ('NOT_QUEUED','QUEUED','PROCESSING','DONE','FAILED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_processing_attempt_nonnegative
    check (processing_attempt_count>=0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_processing_error_length
    check (processing_error is null or length(processing_error)<=2000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_processor_id_length
    check (processor_id is null or length(processor_id) between 1 and 200);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_normalized_byte_size_positive
    check (normalized_byte_size is null or normalized_byte_size>0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_original_disposition
    check (original_disposition in ('PENDING','RETAIN','DELETE_QUEUED','DELETED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_processing_shape
    check (
      (processing_status='NOT_QUEUED'
        and processing_started_at is null
        and processing_completed_at is null
        and processing_claim_token is null)
      or
      (processing_status='QUEUED'
        and processing_requested_at is not null
        and processing_started_at is null
        and processing_completed_at is null
        and processing_claim_token is null)
      or
      (processing_status='PROCESSING'
        and processing_requested_at is not null
        and processing_started_at is not null
        and processing_completed_at is null
        and processing_lease_until is not null
        and processing_claim_token is not null
        and processor_id is not null)
      or
      (processing_status in ('DONE','FAILED')
        and processing_requested_at is not null
        and processing_started_at is not null
        and processing_completed_at is not null)
    );
exception when duplicate_object then null; end $$;

create index if not exists occurrence_evidence_processing_queue_idx
  on public.schedule_occurrence_evidence(processing_status,processing_requested_at,processing_lease_until)
  where verification_status='PENDING';

-- Redefine finalization so upload completion and processor handoff are atomic.
create or replace function app_private.finalize_evidence_upload(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_sha256_hex text,
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
  e public.schedule_occurrence_evidence%rowtype;
  task_row public.schedule_occurrence_task%rowtype;
  occ public.schedule_occurrence%rowtype;
  existing jsonb;
  clean_sha text:=lower(trim(coalesce(p_sha256_hex,'')));
  v_now timestamptz:=now();
  v_next_version bigint;
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    raise exception 'USER role is required to finalize evidence';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Evidence version is required';
  end if;
  if clean_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 checksum must be 64 hexadecimal characters';
  end if;
  if p_source_channel not in ('WEB','API','MOBILE') then
    raise exception 'Invalid source channel';
  end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'EVIDENCE_UPLOAD_FINALIZE',trim(p_idempotency_key)),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where organization_id=org_id
    and operation_code='EVIDENCE_UPLOAD_FINALIZE'
    and idempotency_key=trim(p_idempotency_key);

  if existing is not null then
    if (existing->>'evidenceId')::uuid<>p_evidence_id
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'sha256Hex','')<>clean_sha
       or coalesce(existing->>'sourceChannel','')<>p_source_channel
       or coalesce(existing->>'membershipId','')<>membership_id::text
    then
      raise exception 'Idempotency key belongs to another evidence finalize request';
    end if;
    return p_evidence_id;
  end if;

  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id and organization_id=org_id
  for update;

  if e.id is null then raise exception 'Evidence not found'; end if;
  if not app_private.has_site_scope(e.site_id) then raise exception 'Site scope is required'; end if;
  if e.created_by_membership_id<>membership_id then
    raise exception 'Only the membership that created this Evidence intent may finalize it';
  end if;
  if e.version<>p_expected_version then
    raise exception 'Evidence version conflict';
  end if;
  if e.upload_status<>'INTENT' then
    raise exception 'Evidence upload is not awaiting finalization';
  end if;
  if e.upload_expires_at is null or e.upload_expires_at<=v_now then
    raise exception 'Evidence upload intent has expired';
  end if;

  select * into task_row
  from public.schedule_occurrence_task
  where id=e.occurrence_task_id and organization_id=org_id
  for update;

  select * into occ
  from public.schedule_occurrence
  where id=e.occurrence_id and organization_id=org_id
  for update;

  if task_row.id is null or task_row.status<>'IN_PROGRESS' then
    raise exception 'Evidence Task is no longer in progress';
  end if;
  if occ.id is null or occ.status<>'IN_PROGRESS' or occ.assigned_membership_id<>membership_id then
    raise exception 'Evidence Occurrence is no longer executable by this membership';
  end if;

  v_next_version:=e.version+1;

  update public.schedule_occurrence_evidence
  set upload_status='UPLOADED',
      uploaded_at=v_now,
      sha256_hex=clean_sha,
      processing_status='QUEUED',
      processing_requested_at=v_now,
      processing_error=null,
      updated_at=v_now,
      version=v_next_version
  where id=e.id
    and organization_id=org_id
    and version=p_expected_version
    and upload_status='INTENT';

  if not found then raise exception 'Evidence version conflict'; end if;

  insert into public.outbox_event(
    organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key
  ) values (
    org_id,
    'EVIDENCE_PROCESS_REQUESTED',
    'ScheduleOccurrenceEvidence',
    e.id::text,
    jsonb_build_object(
      'evidenceId',e.id,
      'organizationId',org_id,
      'siteId',e.site_id,
      'workAreaId',e.work_area_id,
      'occurrenceId',e.occurrence_id,
      'occurrenceTaskId',e.occurrence_task_id,
      'storageBucket',e.storage_bucket,
      'objectKey',e.object_key,
      'evidenceType',e.evidence_type,
      'contentType',e.content_type,
      'byteSize',e.byte_size,
      'sha256Hex',clean_sha,
      'evidenceVersion',v_next_version
    ),
    concat('evidence-process:',e.id::text,':',v_next_version::text)
  ) on conflict (idempotency_key) do nothing;

  perform app_private.audit_occurrence_evidence_event(
    'OCCURRENCE_EVIDENCE_UPLOADED',
    e.id,e.occurrence_task_id,e.occurrence_id,
    jsonb_build_object(
      'uploadStatus',e.upload_status,
      'verificationStatus',e.verification_status,
      'processingStatus',e.processing_status,
      'version',e.version
    ),
    jsonb_build_object(
      'uploadStatus','UPLOADED',
      'verificationStatus','PENDING',
      'processingStatus','QUEUED',
      'sha256Recorded',true,
      'version',v_next_version
    ),
    null,p_source_channel
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    org_id,'EVIDENCE_UPLOAD_FINALIZE',trim(p_idempotency_key),
    jsonb_build_object(
      'evidenceId',e.id,
      'expectedVersion',p_expected_version,
      'sha256Hex',clean_sha,
      'sourceChannel',p_source_channel,
      'membershipId',membership_id
    )
  );

  return e.id;
end;
$$;

create or replace function app_private.claim_evidence_processing(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_processor_id text,
  p_idempotency_key text
)
returns table(
  result_evidence_id uuid,
  result_organization_id uuid,
  result_storage_bucket text,
  result_object_key text,
  result_evidence_type schedule_random_evidence_type,
  result_content_type text,
  result_byte_size bigint,
  result_sha256_hex text,
  result_claim_token uuid,
  result_lease_until timestamptz,
  result_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  e public.schedule_occurrence_evidence%rowtype;
  existing jsonb;
  clean_processor text:=nullif(trim(coalesce(p_processor_id,'')),'');
  clean_key text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_now timestamptz:=now();
  v_token uuid:=gen_random_uuid();
  v_lease timestamptz:=now()+interval '5 minutes';
  v_next_version bigint;
begin
  if clean_processor is null or length(clean_processor)>200 then
    raise exception 'Processor id is required and cannot exceed 200 characters';
  end if;
  if clean_key is null then raise exception 'idempotency key is required'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Evidence version is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|','EVIDENCE_PROCESS_CLAIM',clean_key),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where operation_code='EVIDENCE_PROCESS_CLAIM'
    and idempotency_key=clean_key;

  if existing is not null then
    if (existing->>'evidenceId')::uuid<>p_evidence_id
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'processorId','')<>clean_processor
    then
      raise exception 'Idempotency key belongs to another processing-claim request';
    end if;
    return query select
      p_evidence_id,
      (existing->>'organizationId')::uuid,
      existing->>'storageBucket',
      existing->>'objectKey',
      (existing->>'evidenceType')::schedule_random_evidence_type,
      existing->>'contentType',
      (existing->>'byteSize')::bigint,
      existing->>'sha256Hex',
      (existing->>'claimToken')::uuid,
      (existing->>'leaseUntil')::timestamptz,
      (existing->>'version')::bigint;
    return;
  end if;

  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id
  for update;

  if e.id is null then raise exception 'Evidence not found'; end if;
  if e.version<>p_expected_version then raise exception 'Evidence version conflict'; end if;
  if e.upload_status<>'UPLOADED' or e.verification_status<>'PENDING' then
    raise exception 'Only uploaded PENDING Evidence may be processed';
  end if;
  if e.processing_status='PROCESSING' and e.processing_lease_until>v_now then
    raise exception 'Evidence processing lease is active';
  end if;
  if e.processing_status not in ('QUEUED','PROCESSING') then
    raise exception 'Evidence is not queued for processing';
  end if;
  if e.sha256_hex is null or e.content_type is null or e.byte_size is null then
    raise exception 'Evidence upload metadata is incomplete';
  end if;

  v_next_version:=e.version+1;

  update public.schedule_occurrence_evidence
  set processing_status='PROCESSING',
      processing_started_at=coalesce(processing_started_at,v_now),
      processing_lease_until=v_lease,
      processing_claim_token=v_token,
      processor_id=clean_processor,
      processing_attempt_count=processing_attempt_count+1,
      processing_error=null,
      updated_at=v_now,
      version=v_next_version
  where id=e.id and version=p_expected_version;

  if not found then raise exception 'Evidence version conflict'; end if;

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    e.organization_id,'EVIDENCE_PROCESS_CLAIM',clean_key,
    jsonb_build_object(
      'evidenceId',e.id,
      'organizationId',e.organization_id,
      'expectedVersion',p_expected_version,
      'processorId',clean_processor,
      'storageBucket',e.storage_bucket,
      'objectKey',e.object_key,
      'evidenceType',e.evidence_type,
      'contentType',e.content_type,
      'byteSize',e.byte_size,
      'sha256Hex',e.sha256_hex,
      'claimToken',v_token,
      'leaseUntil',v_lease,
      'version',v_next_version
    )
  );

  return query select
    e.id,e.organization_id,e.storage_bucket,e.object_key,e.evidence_type,
    e.content_type,e.byte_size,e.sha256_hex,v_token,v_lease,v_next_version;
end;
$$;

create or replace function app_private.complete_evidence_processing(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_claim_token uuid,
  p_processor_id text,
  p_result text,
  p_observed_content_type text,
  p_observed_byte_size bigint,
  p_observed_sha256_hex text,
  p_normalized_object_key text,
  p_normalized_content_type text,
  p_normalized_byte_size bigint,
  p_preview_object_key text,
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
  e public.schedule_occurrence_evidence%rowtype;
  existing jsonb;
  clean_processor text:=nullif(trim(coalesce(p_processor_id,'')),'');
  clean_result text:=upper(trim(coalesce(p_result,'')));
  clean_sha text:=lower(trim(coalesce(p_observed_sha256_hex,'')));
  clean_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  clean_key text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  clean_norm_key text:=nullif(trim(coalesce(p_normalized_object_key,'')),'');
  clean_preview_key text:=nullif(trim(coalesce(p_preview_object_key,'')),'');
  clean_norm_type text:=nullif(lower(trim(coalesce(p_normalized_content_type,''))),'');
  v_now timestamptz:=now();
  v_next_version bigint;
  v_original_disposition text;
begin
  if clean_processor is null or length(clean_processor)>200 then
    raise exception 'Processor id is required and cannot exceed 200 characters';
  end if;
  if clean_key is null then raise exception 'idempotency key is required'; end if;
  if p_claim_token is null then raise exception 'processing claim token is required'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'Expected Evidence version is required';
  end if;
  if clean_result not in ('VERIFIED','REJECTED') then
    raise exception 'Processing result must be VERIFIED or REJECTED';
  end if;
  if clean_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'Observed SHA-256 checksum must be 64 hexadecimal characters';
  end if;
  if p_observed_byte_size is null or p_observed_byte_size<1 then
    raise exception 'Observed byte size must be positive';
  end if;
  if clean_result='REJECTED' and clean_reason is null then
    raise exception 'Rejected Evidence requires a reason';
  end if;
  if clean_reason is not null and length(clean_reason)>2000 then
    raise exception 'Processing reason cannot exceed 2000 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|','EVIDENCE_PROCESS_COMPLETE',clean_key),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where operation_code='EVIDENCE_PROCESS_COMPLETE'
    and idempotency_key=clean_key;

  if existing is not null then
    if (existing->>'evidenceId')::uuid<>p_evidence_id
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'claimToken','')<>p_claim_token::text
       or coalesce(existing->>'processorId','')<>clean_processor
       or coalesce(existing->>'result','')<>clean_result
    then
      raise exception 'Idempotency key belongs to another processing-completion request';
    end if;
    return p_evidence_id;
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
  if e.processing_lease_until is null or e.processing_lease_until<=v_now then
    raise exception 'Evidence processing lease has expired';
  end if;

  if lower(coalesce(e.content_type,''))<>lower(coalesce(p_observed_content_type,'')) then
    raise exception 'Observed content type does not match uploaded Evidence metadata';
  end if;
  if e.byte_size<>p_observed_byte_size then
    raise exception 'Observed byte size does not match uploaded Evidence metadata';
  end if;
  if lower(coalesce(e.sha256_hex,''))<>clean_sha then
    raise exception 'Observed checksum does not match uploaded Evidence metadata';
  end if;

  if clean_result='VERIFIED' then
    if clean_norm_key is null then raise exception 'Verified Evidence requires a normalized object key'; end if;
    if clean_norm_type is null then raise exception 'Verified Evidence requires a normalized content type'; end if;
    if p_normalized_byte_size is null or p_normalized_byte_size<1 then
      raise exception 'Verified Evidence requires a positive normalized byte size';
    end if;
    if clean_norm_key=e.object_key then
      raise exception 'Normalized object key must differ from original object key';
    end if;
    if position(e.organization_id::text||'/' in clean_norm_key)<>1 then
      raise exception 'Normalized object key must remain Organization-scoped';
    end if;
    if clean_preview_key is not null
       and position(e.organization_id::text||'/' in clean_preview_key)<>1 then
      raise exception 'Preview object key must remain Organization-scoped';
    end if;

    if e.evidence_type='PHOTO' and clean_norm_type not in ('image/jpeg','image/webp') then
      raise exception 'Normalized PHOTO must be JPEG or WebP';
    end if;
    if e.evidence_type='VIDEO' and clean_norm_type<>'video/mp4' then
      raise exception 'Normalized VIDEO must be MP4';
    end if;

    v_original_disposition:=case when coalesce(p_retain_original,false) then 'RETAIN' else 'DELETE_QUEUED' end;
  else
    clean_norm_key:=null;
    clean_norm_type:=null;
    p_normalized_byte_size:=null;
    clean_preview_key:=null;
    v_original_disposition:='RETAIN';
  end if;

  v_next_version:=e.version+1;

  update public.schedule_occurrence_evidence
  set verification_status=clean_result,
      verified_at=case when clean_result='VERIFIED' then v_now else null end,
      verification_reason=clean_reason,
      processing_status=case when clean_result='VERIFIED' then 'DONE' else 'FAILED' end,
      processing_completed_at=v_now,
      processing_lease_until=null,
      processing_claim_token=null,
      processing_error=case when clean_result='REJECTED' then clean_reason else null end,
      normalized_object_key=clean_norm_key,
      normalized_content_type=clean_norm_type,
      normalized_byte_size=p_normalized_byte_size,
      preview_object_key=clean_preview_key,
      original_disposition=v_original_disposition,
      updated_at=v_now,
      version=v_next_version
  where id=e.id and version=p_expected_version;

  if not found then raise exception 'Evidence version conflict'; end if;

  if clean_result='VERIFIED' and v_original_disposition='DELETE_QUEUED' then
    insert into public.outbox_event(
      organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key
    ) values (
      e.organization_id,
      'EVIDENCE_ORIGINAL_DELETE_REQUESTED',
      'ScheduleOccurrenceEvidence',
      e.id::text,
      jsonb_build_object(
        'evidenceId',e.id,
        'organizationId',e.organization_id,
        'storageBucket',e.storage_bucket,
        'objectKey',e.object_key,
        'evidenceVersion',v_next_version
      ),
      concat('evidence-original-delete:',e.id::text,':',v_next_version::text)
    ) on conflict (idempotency_key) do nothing;
  end if;

  insert into public.audit_event(
    organization_id,actor_user_id,actor_membership_id,
    actor_display_name_snapshot,module_code,action_code,
    entity_type,entity_id,old_value_json,new_value_json,
    source_channel,reason
  ) values (
    e.organization_id,null,null,
    clean_processor,'OCCURRENCE_EVIDENCE',
    case when clean_result='VERIFIED'
      then 'OCCURRENCE_EVIDENCE_VERIFIED'
      else 'OCCURRENCE_EVIDENCE_REJECTED'
    end,
    'ScheduleOccurrenceEvidence',e.id::text,
    jsonb_build_object(
      'verificationStatus',e.verification_status,
      'processingStatus',e.processing_status,
      'version',e.version
    ),
    jsonb_build_object(
      'verificationStatus',clean_result,
      'processingStatus',case when clean_result='VERIFIED' then 'DONE' else 'FAILED' end,
      'normalizedObjectKey',clean_norm_key,
      'previewObjectKey',clean_preview_key,
      'originalDisposition',v_original_disposition,
      'version',v_next_version
    ),
    'WORKER',clean_reason
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    e.organization_id,'EVIDENCE_PROCESS_COMPLETE',clean_key,
    jsonb_build_object(
      'evidenceId',e.id,
      'expectedVersion',p_expected_version,
      'claimToken',p_claim_token,
      'processorId',clean_processor,
      'result',clean_result
    )
  );

  return e.id;
end;
$$;

-- Runtime/application roles can never invoke processor commands.
revoke all on function app_private.claim_evidence_processing(uuid,bigint,text,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.complete_evidence_processing(
  uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text
) from public,anon,authenticated,vnext_runtime;

-- Upload finalization remains available only to the normal application runtime.
revoke all on function app_private.finalize_evidence_upload(uuid,bigint,text,text,text)
  from public,anon,authenticated;
grant execute on function app_private.finalize_evidence_upload(uuid,bigint,text,text,text)
  to vnext_runtime;
