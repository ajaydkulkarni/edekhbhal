-- Evidence Processing Worker — Real Media Processing Foundation 03B2
-- Retry-safe event-bound processing claims, terminal-safe outbox acknowledgement,
-- observation-based rejection, and explicit retry lease release.
--
-- IMPORTANT:
-- - Migration 0019 is already applied. Do not modify or reapply it.
-- - This migration does not create credentials or Storage policies.
-- - The deployment worker remains non-BYPASSRLS and receives only command EXECUTE.
-- - Media codecs run in the separate worker process, not in PostgreSQL.

create or replace function app_private.claim_evidence_processing_for_event(
  p_event_id uuid,
  p_event_claim_token uuid,
  p_worker_id text,
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
  evt public.outbox_event%rowtype;
  e public.schedule_occurrence_evidence%rowtype;
  existing jsonb;
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  clean_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_evidence_id uuid;
  v_payload_version bigint;
  v_now timestamptz:=now();
  v_token uuid:=gen_random_uuid();
  v_lease timestamptz:=now()+interval '5 minutes';
  v_next_version bigint;
begin
  if p_event_id is null or p_event_claim_token is null then
    raise exception 'Worker event id and claim token are required';
  end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;
  if clean_idem is null then raise exception 'idempotency key is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|','EVIDENCE_PROCESS_CLAIM_EVENT',p_event_id::text,p_event_claim_token::text),0
  ));

  select * into evt
  from public.outbox_event o
  where o.id=p_event_id
  for update;

  if evt.id is null then raise exception 'Worker event not found'; end if;
  if evt.processed_at is not null then raise exception 'Worker event is already processed'; end if;
  if evt.event_type<>'EVIDENCE_PROCESS_REQUESTED'
     or evt.aggregate_type<>'ScheduleOccurrenceEvidence' then
    raise exception 'Worker event is not an Evidence processing request';
  end if;
  if evt.worker_claim_token is distinct from p_event_claim_token
     or evt.worker_id is distinct from clean_worker then
    raise exception 'Worker event claim mismatch';
  end if;
  if evt.worker_lease_until is null or evt.worker_lease_until<=v_now then
    raise exception 'Worker event lease has expired';
  end if;

  begin
    v_evidence_id:=evt.aggregate_id::uuid;
  exception when others then
    raise exception 'Worker event aggregate id is not a valid Evidence id';
  end;

  select * into e
  from public.schedule_occurrence_evidence
  where id=v_evidence_id and organization_id=evt.organization_id
  for update;

  if e.id is null then raise exception 'Evidence target for worker event was not found'; end if;

  if coalesce(evt.payload_json->>'evidenceId','')<>e.id::text
     or coalesce(evt.payload_json->>'organizationId','')<>e.organization_id::text
     or coalesce(evt.payload_json->>'storageBucket','')<>e.storage_bucket
     or coalesce(evt.payload_json->>'objectKey','')<>e.object_key
     or upper(coalesce(evt.payload_json->>'evidenceType',''))<>e.evidence_type::text
     or lower(coalesce(evt.payload_json->>'contentType',''))<>lower(coalesce(e.content_type,''))
     or coalesce((evt.payload_json->>'byteSize')::bigint,-1)<>e.byte_size
     or lower(coalesce(evt.payload_json->>'sha256Hex',''))<>lower(coalesce(e.sha256_hex,''))
  then
    raise exception 'Evidence processing event payload no longer matches its target';
  end if;

  v_payload_version:=nullif(evt.payload_json->>'evidenceVersion','')::bigint;
  if v_payload_version is null or v_payload_version<1 or v_payload_version>e.version then
    raise exception 'Evidence processing event version is invalid';
  end if;

  select result_json into existing
  from public.operation_idempotency
  where organization_id=e.organization_id
    and operation_code='EVIDENCE_PROCESS_CLAIM_EVENT'
    and idempotency_key=clean_idem;

  if existing is not null then
    if coalesce(existing->>'eventId','')<>p_event_id::text
       or coalesce(existing->>'eventClaimToken','')<>p_event_claim_token::text
       or coalesce(existing->>'workerId','')<>clean_worker
    then
      raise exception 'Idempotency key belongs to another event-bound processing claim';
    end if;

    return query select
      (existing->>'evidenceId')::uuid,
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
      processor_id=clean_worker,
      processing_attempt_count=processing_attempt_count+1,
      processing_error=null,
      updated_at=v_now,
      version=v_next_version
  where id=e.id and version=e.version;

  if not found then raise exception 'Evidence version conflict'; end if;

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    e.organization_id,'EVIDENCE_PROCESS_CLAIM_EVENT',clean_idem,
    jsonb_build_object(
      'eventId',p_event_id,
      'eventClaimToken',p_event_claim_token,
      'workerId',clean_worker,
      'evidenceId',e.id,
      'organizationId',e.organization_id,
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

create or replace function app_private.release_evidence_processing_lease_for_retry(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_claim_token uuid,
  p_processor_id text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  e public.schedule_occurrence_evidence%rowtype;
  clean_processor text:=nullif(trim(coalesce(p_processor_id,'')),'');
  clean_reason text:=nullif(trim(coalesce(p_reason,'')),'');
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
  if clean_reason is null or length(clean_reason)>2000 then
    raise exception 'Retry reason is required and cannot exceed 2000 characters';
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

  -- The processing lease is operational state. Expiring it does not bump the
  -- Evidence version, just as a heartbeat renewal does not bump the version.
  -- The next event-bound claim uses the current Evidence version and will bump it.
  update public.schedule_occurrence_evidence
  set processing_lease_until=now(),
      processing_error=clean_reason,
      updated_at=now()
  where id=e.id and version=p_expected_version;

  return e.id;
end;
$$;

create or replace function app_private.reject_evidence_processing_observation(
  p_evidence_id uuid,
  p_expected_version bigint,
  p_claim_token uuid,
  p_processor_id text,
  p_observed_content_type text,
  p_observed_byte_size bigint,
  p_observed_sha256_hex text,
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
  clean_type text:=nullif(lower(trim(coalesce(p_observed_content_type,''))),'');
  clean_sha text:=nullif(lower(trim(coalesce(p_observed_sha256_hex,''))),'');
  clean_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  clean_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  has_observation boolean;
  v_next_version bigint;
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
  if clean_reason is null or length(clean_reason)>2000 then
    raise exception 'Rejection reason is required and cannot exceed 2000 characters';
  end if;
  if clean_idem is null then raise exception 'idempotency key is required'; end if;

  has_observation:=clean_type is not null or p_observed_byte_size is not null or clean_sha is not null;
  if has_observation then
    if clean_type is null or length(clean_type)>200
       or p_observed_byte_size is null or p_observed_byte_size<0
       or clean_sha is null or clean_sha !~ '^[0-9a-f]{64}$'
    then
      raise exception 'Observed rejection metadata must be complete and valid';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|','EVIDENCE_PROCESS_REJECT_OBSERVATION',clean_idem),0
  ));

  select * into e
  from public.schedule_occurrence_evidence
  where id=p_evidence_id
  for update;

  if e.id is null then raise exception 'Evidence not found'; end if;

  select result_json into existing
  from public.operation_idempotency
  where organization_id=e.organization_id
    and operation_code='EVIDENCE_PROCESS_REJECT_OBSERVATION'
    and idempotency_key=clean_idem;

  if existing is not null then
    if coalesce(existing->>'evidenceId','')<>p_evidence_id::text
       or coalesce((existing->>'expectedVersion')::bigint,-1)<>p_expected_version
       or coalesce(existing->>'claimToken','')<>p_claim_token::text
       or coalesce(existing->>'processorId','')<>clean_processor
       or coalesce(existing->>'observedContentType','')<>coalesce(clean_type,'')
       or coalesce((existing->>'observedByteSize')::bigint,-1)<>coalesce(p_observed_byte_size,-1)
       or coalesce(existing->>'observedSha256Hex','')<>coalesce(clean_sha,'')
       or coalesce(existing->>'reason','')<>clean_reason
    then
      raise exception 'Idempotency key belongs to another processing rejection';
    end if;
    return p_evidence_id;
  end if;

  if e.version<>p_expected_version then raise exception 'Evidence version conflict'; end if;
  if e.processing_status<>'PROCESSING' or e.verification_status<>'PENDING' then
    raise exception 'Evidence is not awaiting a processing decision';
  end if;
  if e.processing_claim_token is distinct from p_claim_token then
    raise exception 'Processing claim token mismatch';
  end if;
  if e.processor_id is distinct from clean_processor then
    raise exception 'Processing claim belongs to another processor';
  end if;
  if e.processing_lease_until is null or e.processing_lease_until<=now() then
    raise exception 'Evidence processing lease has expired';
  end if;

  v_next_version:=e.version+1;

  update public.schedule_occurrence_evidence
  set verification_status='REJECTED',
      verified_at=null,
      verification_reason=clean_reason,
      processing_status='FAILED',
      processing_completed_at=now(),
      processing_lease_until=null,
      processing_claim_token=null,
      processing_error=clean_reason,
      normalized_object_key=null,
      normalized_content_type=null,
      normalized_byte_size=null,
      preview_object_key=null,
      original_disposition='RETAIN',
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
    e.organization_id,null,null,clean_processor,
    'OCCURRENCE_EVIDENCE','OCCURRENCE_EVIDENCE_REJECTED',
    'ScheduleOccurrenceEvidence',e.id::text,
    jsonb_build_object(
      'verificationStatus',e.verification_status,
      'processingStatus',e.processing_status,
      'version',e.version
    ),
    jsonb_build_object(
      'verificationStatus','REJECTED',
      'processingStatus','FAILED',
      'expectedContentType',e.content_type,
      'expectedByteSize',e.byte_size,
      'expectedSha256Hex',e.sha256_hex,
      'observedContentType',clean_type,
      'observedByteSize',p_observed_byte_size,
      'observedSha256Hex',clean_sha,
      'originalDisposition','RETAIN',
      'version',v_next_version
    ),
    'WORKER',clean_reason
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    e.organization_id,'EVIDENCE_PROCESS_REJECT_OBSERVATION',clean_idem,
    jsonb_build_object(
      'evidenceId',e.id,
      'expectedVersion',p_expected_version,
      'claimToken',p_claim_token,
      'processorId',clean_processor,
      'observedContentType',clean_type,
      'observedByteSize',p_observed_byte_size,
      'observedSha256Hex',clean_sha,
      'reason',clean_reason
    )
  );

  return e.id;
end;
$$;

create or replace function app_private.complete_evidence_worker_event_if_terminal(
  p_event_id uuid,
  p_claim_token uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  evt public.outbox_event%rowtype;
  e public.schedule_occurrence_evidence%rowtype;
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  v_evidence_id uuid;
  is_terminal boolean:=false;
begin
  if p_event_id is null or p_claim_token is null then
    raise exception 'Worker event id and claim token are required';
  end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;

  select * into evt
  from public.outbox_event
  where id=p_event_id
  for update;

  if evt.id is null then raise exception 'Worker event not found'; end if;
  if evt.processed_at is not null then return true; end if;
  if evt.event_type not in ('EVIDENCE_PROCESS_REQUESTED','EVIDENCE_ORIGINAL_DELETE_REQUESTED')
     or evt.aggregate_type<>'ScheduleOccurrenceEvidence' then
    raise exception 'Worker event is not a supported Evidence event';
  end if;
  if evt.worker_claim_token is distinct from p_claim_token
     or evt.worker_id is distinct from clean_worker then
    raise exception 'Worker event claim mismatch';
  end if;
  if evt.worker_lease_until is null or evt.worker_lease_until<=now() then
    raise exception 'Worker event lease has expired';
  end if;

  begin
    v_evidence_id:=evt.aggregate_id::uuid;
  exception when others then
    raise exception 'Worker event aggregate id is not a valid Evidence id';
  end;

  select * into e
  from public.schedule_occurrence_evidence
  where id=v_evidence_id and organization_id=evt.organization_id;

  if e.id is null then raise exception 'Evidence target for worker event was not found'; end if;

  if evt.event_type='EVIDENCE_PROCESS_REQUESTED' then
    is_terminal:=e.verification_status in ('VERIFIED','REJECTED')
      and e.processing_status in ('DONE','FAILED');
  else
    is_terminal:=e.original_disposition='DELETED';
  end if;

  if not is_terminal then return false; end if;

  update public.outbox_event
  set processed_at=now(),
      worker_claim_token=null,
      worker_id=null,
      worker_lease_until=null,
      last_error=null
  where id=evt.id;

  return true;
end;
$$;


create or replace function app_private.mark_evidence_original_deleted_for_event(
  p_event_id uuid,
  p_event_claim_token uuid,
  p_worker_id text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  evt public.outbox_event%rowtype;
  e public.schedule_occurrence_evidence%rowtype;
  clean_worker text:=nullif(trim(coalesce(p_worker_id,'')),'');
  clean_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_evidence_id uuid;
  v_expected_version bigint;
  v_object_key text;
begin
  if p_event_id is null or p_event_claim_token is null then
    raise exception 'Worker event id and claim token are required';
  end if;
  if clean_worker is null or length(clean_worker)>200 then
    raise exception 'Worker id is required and cannot exceed 200 characters';
  end if;
  if clean_idem is null then raise exception 'idempotency key is required'; end if;

  select * into evt
  from public.outbox_event
  where id=p_event_id
  for update;

  if evt.id is null then raise exception 'Worker event not found'; end if;
  if evt.processed_at is not null then raise exception 'Worker event is already processed'; end if;
  if evt.event_type<>'EVIDENCE_ORIGINAL_DELETE_REQUESTED'
     or evt.aggregate_type<>'ScheduleOccurrenceEvidence' then
    raise exception 'Worker event is not an Evidence original-deletion request';
  end if;
  if evt.worker_claim_token is distinct from p_event_claim_token
     or evt.worker_id is distinct from clean_worker then
    raise exception 'Worker event claim mismatch';
  end if;
  if evt.worker_lease_until is null or evt.worker_lease_until<=now() then
    raise exception 'Worker event lease has expired';
  end if;

  begin
    v_evidence_id:=evt.aggregate_id::uuid;
    v_expected_version:=(evt.payload_json->>'evidenceVersion')::bigint;
  exception when others then
    raise exception 'Original-deletion event target/version is invalid';
  end;

  v_object_key:=nullif(evt.payload_json->>'objectKey','');
  if v_object_key is null then raise exception 'Original-deletion event object key is missing'; end if;

  select * into e
  from public.schedule_occurrence_evidence
  where id=v_evidence_id and organization_id=evt.organization_id;

  if e.id is null then raise exception 'Evidence target for original-deletion event was not found'; end if;
  if coalesce(evt.payload_json->>'evidenceId','')<>e.id::text
     or coalesce(evt.payload_json->>'organizationId','')<>e.organization_id::text
     or coalesce(evt.payload_json->>'storageBucket','')<>e.storage_bucket
     or v_object_key<>e.object_key
     or v_expected_version<>e.version
  then
    raise exception 'Original-deletion event payload no longer matches its target';
  end if;

  return app_private.mark_evidence_original_deleted(
    e.id,v_expected_version,v_object_key,clean_worker,clean_idem
  );
end;
$$;

revoke all on function app_private.claim_evidence_processing_for_event(uuid,uuid,text,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.release_evidence_processing_lease_for_retry(uuid,bigint,uuid,text,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.reject_evidence_processing_observation(
  uuid,bigint,uuid,text,text,bigint,text,text,text
) from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.complete_evidence_worker_event_if_terminal(uuid,uuid,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.mark_evidence_original_deleted_for_event(uuid,uuid,text,text)
  from public,anon,authenticated,vnext_runtime;

-- 03B2 intentionally removes free-form worker capabilities. The updated
-- owner-controlled capability-grant script adds only the event-bound replacements.
revoke execute on function app_private.claim_evidence_processing(uuid,bigint,text,text)
  from vnext_evidence_worker;
revoke execute on function app_private.complete_evidence_worker_event(uuid,uuid,text)
  from vnext_evidence_worker;
revoke execute on function app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)
  from vnext_evidence_worker;
