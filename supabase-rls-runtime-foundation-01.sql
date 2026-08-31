-- eDekhbhal RLS Runtime Foundation 01
-- DESIGN-ONLY FOUNDATION: this file does NOT enable RLS on any table.
--
-- Run this in the Supabase SQL Editor for the database used by the
-- environment you are validating.
--
-- These helper functions expose transaction-local PostgreSQL settings.
-- They intentionally return NULL when a context value is absent.

create or replace function public.app_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '');
$$;

create or replace function public.app_organization_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.organization_id', true), '');
$$;

create or replace function public.app_membership_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.membership_id', true), '');
$$;

create or replace function public.app_membership_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.role', true), '');
$$;

comment on function public.app_user_id() is
'eDekhbhal request context: transaction-local application user id.';

comment on function public.app_organization_id() is
'eDekhbhal request context: transaction-local organization id.';

comment on function public.app_membership_id() is
'eDekhbhal request context: transaction-local organization membership id.';

comment on function public.app_membership_role() is
'eDekhbhal request context: transaction-local membership role.';

-- Sanity check: outside a tenant-context transaction these should all be NULL.
select
  public.app_user_id() as user_id,
  public.app_organization_id() as organization_id,
  public.app_membership_id() as membership_id,
  public.app_membership_role() as role;
