-- Evidence Capture & Media Pipeline Foundation 01
-- Application-owned evidence intent/finalization boundary.
-- Supabase Storage bucket/policies are provisioned separately by the platform owner
-- because vnext_migrator intentionally has no privileges on the storage schema.

alter table public.schedule_occurrence_evidence
  add column if not exists storage_bucket text not null default 'occurrence-evidence-private',
  add column if not exists upload_status text not null default 'UPLOADED',
  add column if not exists upload_expires_at timestamptz,
  add column if not exists uploaded_at timestamptz,
  add column if not exists original_filename text,
  add column if not exists normalized_object_key text,
  add column if not exists preview_object_key text,
  add column if not exists verification_reason text,
  add column if not exists version bigint not null default 1;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_upload_status
    check (upload_status in ('INTENT','UPLOADED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_filename_length
    check (original_filename is null or (length(original_filename) between 1 and 255));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_bucket_length
    check (length(storage_bucket) between 1 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_object_key_length
    check (
      length(object_key) between 1 and 1024
      and (normalized_object_key is null or length(normalized_object_key) between 1 and 1024)
      and (preview_object_key is null or length(preview_object_key) between 1 and 1024)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_media_contract
    check (
      content_type is null
      or (
        evidence_type='PHOTO'
        and content_type in ('image/jpeg','image/png','image/webp')
        and (byte_size is null or byte_size<=20971520)
      )
      or (
        evidence_type='VIDEO'
        and content_type in ('video/mp4','video/webm','video/quicktime')
        and (byte_size is null or byte_size<=209715200)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_intent_shape
    check (
      upload_status<>'INTENT'
      or (upload_expires_at is not null and uploaded_at is null and verification_status='PENDING')
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.schedule_occurrence_evidence
    add constraint occurrence_evidence_version_positive
    check (version>=1);
exception when duplicate_object then null; end $$;

create unique index if not exists occurrence_evidence_normalized_key_uq
  on public.schedule_occurrence_evidence(organization_id,normalized_object_key)
  where normalized_object_key is not null;

create unique index if not exists occurrence_evidence_preview_key_uq
  on public.schedule_occurrence_evidence(organization_id,preview_object_key)
  where preview_object_key is not null;

create index if not exists occurrence_evidence_upload_status_idx
  on public.schedule_occurrence_evidence(organization_id,upload_status,upload_expires_at);

create or replace function app_private.audit_occurrence_evidence_event(
  p_action_code text,
  p_evidence_id uuid,
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
    actor_name,'OCCURRENCE_EVIDENCE',p_action_code,
    'ScheduleOccurrenceEvidence',p_evidence_id::text,
    coalesce(p_old,'{}'::jsonb)
      ||jsonb_build_object('occurrenceId',p_occurrence_id,'occurrenceTaskId',p_occurrence_task_id),
    coalesce(p_new,'{}'::jsonb)
      ||jsonb_build_object('occurrenceId',p_occurrence_id,'occurrenceTaskId',p_occurrence_task_id),
    p_source_channel,p_reason
  );
end;
$$;

create or replace function app_private.create_evidence_upload_intent(
  p_occurrence_task_id uuid,
  p_expected_task_version bigint,
  p_evidence_type schedule_random_evidence_type,
  p_original_filename text,
  p_content_type text,
  p_byte_size bigint,
  p_idempotency_key text,
  p_source_channel text
)
returns table(
  result_evidence_id uuid,
  result_storage_bucket text,
  result_object_key text,
  result_upload_expires_at timestamptz,
  result_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org_id uuid:=app_private.current_organization_id();
  membership_id uuid:=app_private.current_membership_id();
  task_row public.schedule_occurrence_task%rowtype;
  occ public.schedule_occurrence%rowtype;
  existing jsonb;
  v_evidence_id uuid:=gen_random_uuid();
  v_bucket text:='occurrence-evidence-private';
  v_content_type text:=lower(trim(coalesce(p_content_type,'')));
  v_filename text:=nullif(trim(coalesce(p_original_filename,'')),'');
  v_extension text;
  v_object_key text;
  v_expires timestamptz:=now()+interval '15 minutes';
begin
  if org_id is null or not app_private.has_active_context(org_id) then
    raise exception 'Active tenant context is required';
  end if;
  if app_private.current_role()<>'USER' then
    raise exception 'USER role is required to capture evidence';
  end if;
  if p_expected_task_version is null or p_expected_task_version<1 then
    raise exception 'Expected Task version is required';
  end if;
  if p_source_channel not in ('WEB','API','MOBILE') then
    raise exception 'Invalid source channel';
  end if;
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'idempotency key is required';
  end if;
  if v_filename is null or length(v_filename)>255 then
    raise exception 'Evidence filename is required and cannot exceed 255 characters';
  end if;
  if p_byte_size is null or p_byte_size<1 then
    raise exception 'Evidence byte size must be positive';
  end if;

  if p_evidence_type='PHOTO' then
    if v_content_type not in ('image/jpeg','image/png','image/webp') then
      raise exception 'PHOTO evidence must be JPEG, PNG, or WebP';
    end if;
    if p_byte_size>20971520 then
      raise exception 'PHOTO evidence cannot exceed 20 MB';
    end if;
    v_extension:=case v_content_type
      when 'image/jpeg' then '.jpg'
      when 'image/png' then '.png'
      else '.webp'
    end;
  elsif p_evidence_type='VIDEO' then
    if v_content_type not in ('video/mp4','video/webm','video/quicktime') then
      raise exception 'VIDEO evidence must be MP4, WebM, or QuickTime';
    end if;
    if p_byte_size>209715200 then
      raise exception 'VIDEO evidence cannot exceed 200 MB';
    end if;
    v_extension:=case v_content_type
      when 'video/mp4' then '.mp4'
      when 'video/webm' then '.webm'
      else '.mov'
    end;
  else
    raise exception 'Evidence type must be PHOTO or VIDEO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|',org_id::text,'EVIDENCE_UPLOAD_INTENT',trim(p_idempotency_key)),0
  ));

  select result_json into existing
  from public.operation_idempotency
  where organization_id=org_id
    and operation_code='EVIDENCE_UPLOAD_INTENT'
    and idempotency_key=trim(p_idempotency_key);

  if existing is not null then
    if (existing->>'occurrenceTaskId')::uuid<>p_occurrence_task_id
       or coalesce((existing->>'expectedTaskVersion')::bigint,-1)<>p_expected_task_version
       or coalesce(existing->>'evidenceType','')<>p_evidence_type::text
       or coalesce(existing->>'originalFilename','')<>v_filename
       or coalesce(existing->>'contentType','')<>v_content_type
       or coalesce((existing->>'byteSize')::bigint,-1)<>p_byte_size
       or coalesce(existing->>'sourceChannel','')<>p_source_channel
       or coalesce(existing->>'membershipId','')<>membership_id::text
    then
      raise exception 'Idempotency key belongs to another evidence upload-intent request';
    end if;
    return query select
      (existing->>'evidenceId')::uuid,
      existing->>'storageBucket',
      existing->>'objectKey',
      (existing->>'uploadExpiresAt')::timestamptz,
      (existing->>'version')::bigint;
    return;
  end if;

  select * into task_row
  from public.schedule_occurrence_task
  where id=p_occurrence_task_id and organization_id=org_id
  for update;

  if task_row.id is null then raise exception 'Occurrence Task not found'; end if;
  if not app_private.has_site_scope(task_row.site_id) then raise exception 'Site scope is required'; end if;
  if task_row.status<>'IN_PROGRESS' or task_row.started_at is null then
    raise exception 'Evidence may be captured only for the current IN_PROGRESS Task';
  end if;
  if task_row.version<>p_expected_task_version then
    raise exception 'Occurrence Task version conflict';
  end if;
  if not task_row.evidence_required then
    raise exception 'This Task does not require evidence';
  end if;
  if task_row.required_evidence_type is distinct from p_evidence_type then
    raise exception 'Evidence type does not match the snapshotted Task requirement';
  end if;

  select * into occ
  from public.schedule_occurrence
  where id=task_row.occurrence_id and organization_id=org_id
  for update;

  if occ.id is null then raise exception 'Occurrence not found'; end if;
  if occ.status<>'IN_PROGRESS' or occ.started_at is null then
    raise exception 'Occurrence is not in progress';
  end if;
  if occ.assigned_membership_id<>membership_id then
    raise exception 'Only the active assigned membership may capture evidence';
  end if;

  v_object_key:=concat_ws(
    '/',
    org_id::text,
    occ.id::text,
    task_row.id::text,
    v_evidence_id::text,
    'original'||v_extension
  );

  insert into public.schedule_occurrence_evidence(
    id,organization_id,site_id,work_area_id,occurrence_id,occurrence_task_id,
    evidence_type,object_key,storage_bucket,content_type,byte_size,
    verification_status,upload_status,upload_expires_at,original_filename,
    created_by_membership_id,captured_at,created_at,updated_at,version
  ) values (
    v_evidence_id,org_id,task_row.site_id,task_row.work_area_id,occ.id,task_row.id,
    p_evidence_type,v_object_key,v_bucket,v_content_type,p_byte_size,
    'PENDING','INTENT',v_expires,v_filename,
    membership_id,now(),now(),now(),1
  );

  perform app_private.audit_occurrence_evidence_event(
    'OCCURRENCE_EVIDENCE_INTENT_CREATED',
    v_evidence_id,task_row.id,occ.id,
    null,
    jsonb_build_object(
      'evidenceType',p_evidence_type,
      'contentType',v_content_type,
      'byteSize',p_byte_size,
      'storageBucket',v_bucket,
      'uploadStatus','INTENT'
    ),
    null,p_source_channel
  );

  insert into public.operation_idempotency(
    organization_id,operation_code,idempotency_key,result_json
  ) values (
    org_id,'EVIDENCE_UPLOAD_INTENT',trim(p_idempotency_key),
    jsonb_build_object(
      'evidenceId',v_evidence_id,
      'occurrenceTaskId',task_row.id,
      'expectedTaskVersion',p_expected_task_version,
      'evidenceType',p_evidence_type,
      'originalFilename',v_filename,
      'contentType',v_content_type,
      'byteSize',p_byte_size,
      'sourceChannel',p_source_channel,
      'membershipId',membership_id,
      'storageBucket',v_bucket,
      'objectKey',v_object_key,
      'uploadExpiresAt',v_expires,
      'version',1
    )
  );

  return query select v_evidence_id,v_bucket,v_object_key,v_expires,1::bigint;
end;
$$;

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

  update public.schedule_occurrence_evidence
  set upload_status='UPLOADED',
      uploaded_at=v_now,
      sha256_hex=clean_sha,
      updated_at=v_now,
      version=version+1
  where id=e.id
    and organization_id=org_id
    and version=p_expected_version
    and upload_status='INTENT';

  if not found then raise exception 'Evidence version conflict'; end if;

  perform app_private.audit_occurrence_evidence_event(
    'OCCURRENCE_EVIDENCE_UPLOADED',
    e.id,e.occurrence_task_id,e.occurrence_id,
    jsonb_build_object('uploadStatus',e.upload_status,'verificationStatus',e.verification_status,'version',e.version),
    jsonb_build_object('uploadStatus','UPLOADED','verificationStatus','PENDING','sha256Recorded',true,'version',e.version+1),
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

-- Storage policy helpers deliberately do not depend on transaction-local app.* context.
-- Supabase Storage requests authenticate as the `authenticated` role and the privileged
-- storage policy passes auth.uid()::text as p_auth_subject.
create or replace function public.storage_can_write_occurrence_evidence(
  p_bucket_id text,
  p_object_name text,
  p_auth_subject text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.schedule_occurrence_evidence e
    join public.schedule_occurrence_task t
      on t.id=e.occurrence_task_id
     and t.organization_id=e.organization_id
    join public.schedule_occurrence o
      on o.id=e.occurrence_id
     and o.organization_id=e.organization_id
    join public.organization_membership m
      on m.id=e.created_by_membership_id
     and m.organization_id=e.organization_id
    join public.app_user u
      on u.id=m.user_id
    join public.organization org
      on org.id=e.organization_id
    where e.storage_bucket=p_bucket_id
      and e.object_key=p_object_name
      and e.upload_status='INTENT'
      and e.verification_status='PENDING'
      and e.upload_expires_at>now()
      and t.status='IN_PROGRESS'
      and o.status='IN_PROGRESS'
      and o.assigned_membership_id=m.id
      and m.role_code='USER'
      and m.status='ACTIVE'
      and u.status='ACTIVE'
      and org.status='ACTIVE'
      and u.auth_subject=p_auth_subject
      and exists (
        select 1
        from public.site_membership_scope sms
        where sms.organization_id=e.organization_id
          and sms.site_id=e.site_id
          and sms.membership_id=m.id
      )
  )
$$;

create or replace function public.storage_can_read_occurrence_evidence(
  p_bucket_id text,
  p_object_name text,
  p_auth_subject text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.schedule_occurrence_evidence e
    join public.schedule_occurrence o
      on o.id=e.occurrence_id
     and o.organization_id=e.organization_id
    join public.app_user u
      on u.auth_subject=p_auth_subject
     and u.status='ACTIVE'
    join public.organization_membership m
      on m.user_id=u.id
     and m.organization_id=e.organization_id
     and m.status='ACTIVE'
    join public.organization org
      on org.id=e.organization_id
     and org.status='ACTIVE'
    where e.storage_bucket=p_bucket_id
      and p_object_name in (
        e.object_key,
        coalesce(e.normalized_object_key,''),
        coalesce(e.preview_object_key,'')
      )
      and (
        m.role_code='ADMIN'
        or (
          m.role_code='SITE_MANAGER'
          and exists (
            select 1 from public.site_membership_scope sms
            where sms.organization_id=e.organization_id
              and sms.site_id=e.site_id
              and sms.membership_id=m.id
          )
        )
        or (
          m.role_code='USER'
          and o.assigned_membership_id=m.id
          and exists (
            select 1 from public.site_membership_scope sms
            where sms.organization_id=e.organization_id
              and sms.site_id=e.site_id
              and sms.membership_id=m.id
          )
        )
      )
  )
$$;

revoke all on function app_private.audit_occurrence_evidence_event(text,uuid,uuid,uuid,jsonb,jsonb,text,text)
  from public,anon,authenticated,vnext_runtime;
revoke all on function app_private.create_evidence_upload_intent(uuid,bigint,schedule_random_evidence_type,text,text,bigint,text,text)
  from public,anon,authenticated;
revoke all on function app_private.finalize_evidence_upload(uuid,bigint,text,text,text)
  from public,anon,authenticated;

grant execute on function app_private.create_evidence_upload_intent(uuid,bigint,schedule_random_evidence_type,text,text,bigint,text,text)
  to vnext_runtime;
grant execute on function app_private.finalize_evidence_upload(uuid,bigint,text,text,text)
  to vnext_runtime;

revoke all on function public.storage_can_write_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
revoke all on function public.storage_can_read_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
grant execute on function public.storage_can_write_occurrence_evidence(text,text,text)
  to authenticated;
grant execute on function public.storage_can_read_occurrence_evidence(text,text,text)
  to authenticated;

-- Keep direct Evidence DML closed. Application writes occur only through commands.
revoke insert,update,delete on public.schedule_occurrence_evidence
  from public,anon,authenticated,vnext_runtime;
grant select on public.schedule_occurrence_evidence to vnext_runtime;
