-- Evidence Worker Storage Deletion Confirmation Hardening 03B3
--
-- Live 03B3 certification exposed two coupled issues:
-- 1. Supabase Storage delete requires SELECT + DELETE visibility. The worker
--    DELETE helper allowed the exact DELETE_QUEUED original, but the worker
--    SELECT helper did not.
-- 2. Normal authenticated Storage reads still authorized the original after
--    original_disposition='DELETED'.
--
-- Storage policies themselves remain unchanged; they already delegate to
-- these helper functions.

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
      and (
        (
          p_object_name=e.object_key
          and e.original_disposition<>'DELETED'
        )
        or p_object_name=coalesce(e.normalized_object_key,'')
        or p_object_name=coalesce(e.preview_object_key,'')
      )
      and (
        m.role_code='ADMIN'
        or (
          m.role_code='SITE_MANAGER'
          and exists (
            select 1
            from public.site_membership_scope sms
            where sms.organization_id=e.organization_id
              and sms.site_id=e.site_id
              and sms.membership_id=m.id
          )
        )
        or (
          m.role_code='USER'
          and o.assigned_membership_id=m.id
          and exists (
            select 1
            from public.site_membership_scope sms
            where sms.organization_id=e.organization_id
              and sms.site_id=e.site_id
              and sms.membership_id=m.id
          )
        )
      )
  )
$$;

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
    where e.storage_bucket=p_bucket_id
      and (
        (
          p.worker_id=e.processor_id
          and e.upload_status='UPLOADED'
          and e.verification_status='PENDING'
          and e.processing_status='PROCESSING'
          and e.processing_lease_until>now()
          and (
            (
              e.evidence_type='PHOTO'
              and p_object_name in (
                e.object_key,
                concat_ws(
                  '/',
                  e.organization_id::text,
                  e.occurrence_id::text,
                  e.occurrence_task_id::text,
                  e.id::text,
                  'normalized.webp'
                ),
                concat_ws(
                  '/',
                  e.organization_id::text,
                  e.occurrence_id::text,
                  e.occurrence_task_id::text,
                  e.id::text,
                  'preview.webp'
                )
              )
            )
            or
            (
              e.evidence_type='VIDEO'
              and p_object_name in (
                e.object_key,
                concat_ws(
                  '/',
                  e.organization_id::text,
                  e.occurrence_id::text,
                  e.occurrence_task_id::text,
                  e.id::text,
                  'normalized.mp4'
                ),
                concat_ws(
                  '/',
                  e.organization_id::text,
                  e.occurrence_id::text,
                  e.occurrence_task_id::text,
                  e.id::text,
                  'preview.jpg'
                )
              )
            )
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
        or
        (
          e.upload_status='UPLOADED'
          and e.verification_status='VERIFIED'
          and e.processing_status='DONE'
          and e.original_disposition='DELETE_QUEUED'
          and p_object_name=e.object_key
          and exists (
            select 1
            from public.outbox_event evt
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

revoke all on function public.storage_can_read_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
grant execute on function public.storage_can_read_occurrence_evidence(text,text,text)
  to authenticated;

revoke all on function public.storage_worker_can_read_occurrence_evidence(text,text,text)
  from public,anon,vnext_runtime;
grant execute on function public.storage_worker_can_read_occurrence_evidence(text,text,text)
  to authenticated;
