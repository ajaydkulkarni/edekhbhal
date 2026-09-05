-- app_private Function Privilege Hardening 0023
--
-- Root cause found during Occurrence Worker 04A exhaustive capability audit:
--
-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default.
-- app_private.prevent_organization_name_change() was created in 0001 without
-- an explicit PUBLIC revoke, so worker roles that later received USAGE on
-- app_private inherited execution of that trigger function.
--
-- Hardening:
--
--   1. Remove PUBLIC EXECUTE from every existing app_private function.
--   2. Change vnext_migrator's schema-specific default privileges so future
--      app_private functions do not receive PUBLIC EXECUTE automatically.
--
-- Explicit role grants are preserved. This migration does not alter the
-- Occurrence worker or Evidence worker command contracts.

do $hardening$
declare
  f record;
begin
  for f in
    select
      p.oid::regprocedure as function_signature
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'app_private'
    order by p.oid
  loop
    execute format(
      'revoke execute on function %s from public',
      f.function_signature
    );
  end loop;
end
$hardening$;


alter default privileges
  for role vnext_migrator
  in schema app_private
  revoke execute on functions from public;
