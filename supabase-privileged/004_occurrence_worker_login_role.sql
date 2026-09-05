-- Supabase privileged setup:
-- Occurrence generation worker LOGIN role 04A
--
-- Run separately in the Supabase SQL Editor AFTER:
--   1. migration 0022
--   2. migration 0023
--   3. vnext_occurrence_worker capability role + exact grants
--
-- SECURITY MODEL
--
-- vnext_occurrence_worker
--   NOLOGIN capability role
--   owns no tables
--   exactly three app_private worker commands
--
-- vnext_occurrence_worker_login
--   LOGIN execution identity
--   inherits ONLY vnext_occurrence_worker
--   no direct app/table/function grants
--   no superuser / create / replication / BYPASSRLS capability
--
-- IMPORTANT:
-- This source file intentionally creates the LOGIN with PASSWORD NULL.
-- The real password is assigned separately as an operational secret and
-- must never be committed to Git or pasted into application source.

do $setup$
declare
  r record;
begin

  if not exists(
    select 1
    from pg_roles
    where rolname='vnext_occurrence_worker'
  ) then
    raise exception
      'vnext_occurrence_worker capability role must exist before LOGIN provisioning';
  end if;


  if not exists(
    select 1
    from pg_roles
    where rolname='vnext_occurrence_worker_login'
  ) then

    create role vnext_occurrence_worker_login
      login
      inherit
      password null
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls
      connection limit 3;

  end if;


  select
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolreplication,
    rolbypassrls,
    rolcanlogin,
    rolinherit,
    rolconnlimit
  into r
  from pg_roles
  where rolname='vnext_occurrence_worker_login';


  if r.rolsuper
     or r.rolcreatedb
     or r.rolcreaterole
     or r.rolreplication
     or r.rolbypassrls
     or not r.rolcanlogin
     or not r.rolinherit
     or r.rolconnlimit <> 3
  then
    raise exception
      'vnext_occurrence_worker_login has unsafe role attributes; privileged administrator intervention is required';
  end if;


  -- Remove any known application/worker role inheritance before granting
  -- the single intended capability membership.
  revoke vnext_runtime
    from vnext_occurrence_worker_login;

  revoke vnext_evidence_worker
    from vnext_occurrence_worker_login;

  grant vnext_occurrence_worker
    to vnext_occurrence_worker_login;

end
$setup$;


select
  r.rolname,
  r.rolsuper,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolreplication,
  r.rolbypassrls,
  r.rolcanlogin,
  r.rolinherit,
  r.rolconnlimit,

  pg_has_role(
    r.rolname,
    'vnext_occurrence_worker',
    'member'
  ) as occurrence_capability_member,

  pg_has_role(
    r.rolname,
    'vnext_runtime',
    'member'
  ) as runtime_member,

  pg_has_role(
    r.rolname,
    'vnext_evidence_worker',
    'member'
  ) as evidence_worker_member

from pg_roles r
where r.rolname='vnext_occurrence_worker_login';
