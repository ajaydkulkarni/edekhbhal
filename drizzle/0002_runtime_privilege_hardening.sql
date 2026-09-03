-- Database Foundation 01 privilege hardening
-- Remove broad runtime defaults and establish explicit least-privilege grants.

alter default privileges in schema public
  revoke all on tables from vnext_runtime;

alter default privileges in schema public
  revoke all on sequences from vnext_runtime;

revoke all on table
  organization,
  app_user,
  organization_membership,
  audit_event,
  outbox_event
from vnext_runtime;

grant select, update on organization to vnext_runtime;
grant select, update on app_user to vnext_runtime;
grant select, insert, update on organization_membership to vnext_runtime;
grant select, insert on audit_event to vnext_runtime;
grant insert on outbox_event to vnext_runtime;

-- Defense in depth: explicitly revoke mutation capabilities that must never exist.
revoke insert, delete on organization from vnext_runtime;
revoke insert, delete on app_user from vnext_runtime;
revoke delete on organization_membership from vnext_runtime;
revoke update, delete on audit_event from vnext_runtime;
revoke select, update, delete on outbox_event from vnext_runtime;
