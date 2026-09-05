-- Supabase privileged setup:
-- Occurrence rolling-generation worker capability role 04A
--
-- Run separately with a PostgreSQL role allowed to CREATE ROLE.
-- Do NOT run with vnext_migrator: it intentionally has no CREATEROLE.
--
-- Split-owner model:
--
--   * privileged Supabase/Postgres administration creates/verifies the
--     NOLOGIN capability role
--
--   * vnext_migrator owns app_private worker command functions and applies
--     their exact EXECUTE grants afterward through:
--
--       npm run db:occurrence-worker-role:grant
--
-- This file creates NO LOGIN credential, password, service-role secret,
-- table privilege, or BYPASSRLS identity.

do $setup$
declare
  r record;
begin

  if not exists(
    select 1
    from pg_roles
    where rolname='vnext_occurrence_worker'
  ) then

    create role vnext_occurrence_worker
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;

  end if;


  select
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolreplication,
    rolbypassrls,
    rolcanlogin
  into r
  from pg_roles
  where rolname='vnext_occurrence_worker';


  if r.rolsuper
     or r.rolcreatedb
     or r.rolcreaterole
     or r.rolreplication
     or r.rolbypassrls
     or r.rolcanlogin
  then
    raise exception
      'vnext_occurrence_worker has unsafe role attributes; privileged administrator intervention is required';
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
where rolname='vnext_occurrence_worker';
