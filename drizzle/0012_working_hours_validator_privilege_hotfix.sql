-- Occurrence Foundation privilege hotfix 0012
-- Runtime DML on rows constrained by working-hours JSON must be able to invoke
-- the immutable validator used by CHECK constraints. Keep the helper private
-- from PUBLIC/anon/authenticated and grant only narrow EXECUTE to vnext_runtime.

revoke all on function app_private.is_valid_working_hours_json(jsonb)
  from public, anon, authenticated;

grant execute on function app_private.is_valid_working_hours_json(jsonb)
  to vnext_runtime;
