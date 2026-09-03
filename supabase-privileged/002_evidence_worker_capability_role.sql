-- Supabase privileged setup: Evidence worker capability role 02
--
-- Run separately in the Supabase SQL Editor AFTER application migration 0018.
-- Do NOT run with vnext_migrator: it intentionally has no CREATEROLE.
--
-- IMPORTANT SPLIT-OWNER MODEL:
-- - Supabase project role `postgres` may CREATE ROLE but does not own the
--   app_private worker functions, so this file creates/verifies the role ONLY.
-- - vnext_migrator owns app_private and the worker functions, so exact function
--   grants are applied afterward by:
--       npm run db:evidence-worker-role:grant
--
-- No password, LOGIN principal, service-role key, or BYPASSRLS credential is created.
--
-- CREATE ROLE safe defaults are:
-- NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, NOLOGIN.
-- The verification block fails closed if the existing/new role is not safe.

do $setup$
declare
  r record;
begin
  if not exists(select 1 from pg_roles where rolname='vnext_evidence_worker') then
    execute 'create role vnext_evidence_worker nologin';
  end if;

  select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin
    into r
  from pg_roles
  where rolname='vnext_evidence_worker';

  if r.rolsuper
     or r.rolcreatedb
     or r.rolcreaterole
     or r.rolreplication
     or r.rolbypassrls
     or r.rolcanlogin then
    raise exception 'vnext_evidence_worker has unsafe role attributes; privileged administrator intervention is required';
  end if;
end
$setup$;

select
  rolname,
  rolsuper,
  rolcreatedb,
  rolcreaterole,
  rolreplication,
  rolbypassrls,
  rolcanlogin
from pg_roles
where rolname='vnext_evidence_worker';
