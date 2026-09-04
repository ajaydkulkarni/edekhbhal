-- Supabase Storage privileged setup:
-- Occurrence Evidence Worker Transport 02 (Foundation 03B1)
--
-- RUN SEPARATELY in the Supabase SQL Editor AFTER application migration 0019.
-- Do NOT run this with vnext_runtime or the future worker LOGIN principal.
--
-- The policies use the ordinary `authenticated` Storage role, but the boolean
-- helpers additionally require auth.uid() to be registered as the dedicated
-- Evidence worker machine principal AND bind that principal to live queue /
-- processing leases. A normal user session therefore cannot satisfy them.
--
-- This file creates no Auth user and stores no password/secret.

drop policy if exists occurrence_evidence_worker_select on storage.objects;
create policy occurrence_evidence_worker_select
on storage.objects
for select
to authenticated
using (
  bucket_id='occurrence-evidence-private'
  and public.storage_worker_can_read_occurrence_evidence(
    bucket_id,name,auth.uid()::text
  )
);

drop policy if exists occurrence_evidence_worker_insert on storage.objects;
create policy occurrence_evidence_worker_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='occurrence-evidence-private'
  and public.storage_worker_can_write_occurrence_evidence(
    bucket_id,name,auth.uid()::text
  )
);

drop policy if exists occurrence_evidence_worker_update on storage.objects;
create policy occurrence_evidence_worker_update
on storage.objects
for update
to authenticated
using (
  bucket_id='occurrence-evidence-private'
  and public.storage_worker_can_write_occurrence_evidence(
    bucket_id,name,auth.uid()::text
  )
)
with check (
  bucket_id='occurrence-evidence-private'
  and public.storage_worker_can_write_occurrence_evidence(
    bucket_id,name,auth.uid()::text
  )
);

drop policy if exists occurrence_evidence_worker_delete on storage.objects;
create policy occurrence_evidence_worker_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='occurrence-evidence-private'
  and public.storage_worker_can_delete_occurrence_evidence(
    bucket_id,name,auth.uid()::text
  )
);
