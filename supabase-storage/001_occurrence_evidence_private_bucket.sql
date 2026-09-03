-- Supabase Storage privileged setup: Occurrence Evidence Private Bucket 01
--
-- RUN SEPARATELY as a Supabase platform/database owner (for example in the
-- Supabase SQL Editor). Do NOT run this with vnext_migrator.
--
-- Preconditions:
--   1. Application migration 0016_evidence_capture_foundation.sql is applied.
--   2. public.storage_can_write_occurrence_evidence(...) and
--      public.storage_can_read_occurrence_evidence(...) exist.
--
-- This creates a PRIVATE bucket. There is intentionally no public-read,
-- UPDATE, or DELETE policy for evidence objects.

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
) values (
  'occurrence-evidence-private',
  'occurrence-evidence-private',
  false,
  209715200,
  array[
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/webm','video/quicktime'
  ]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists occurrence_evidence_private_insert on storage.objects;
create policy occurrence_evidence_private_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='occurrence-evidence-private'
  and public.storage_can_write_occurrence_evidence(
    bucket_id,
    name,
    auth.uid()::text
  )
);

drop policy if exists occurrence_evidence_private_select on storage.objects;
create policy occurrence_evidence_private_select
on storage.objects
for select
to authenticated
using (
  bucket_id='occurrence-evidence-private'
  and public.storage_can_read_occurrence_evidence(
    bucket_id,
    name,
    auth.uid()::text
  )
);
