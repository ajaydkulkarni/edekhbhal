-- vNext Database Foundation 01
-- RLS-native core tenancy / audit / outbox foundation.

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to vnext_runtime;

do $$ begin
  create type membership_role as enum ('ADMIN','SITE_MANAGER','USER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type record_status as enum ('ACTIVE','INACTIVE');
exception when duplicate_object then null;
end $$;

create table if not exists organization (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null,
  default_currency_code text not null,
  default_timezone text not null,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null unique,
  email text,
  display_name text,
  preferred_language text not null default 'en',
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_membership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  user_id uuid not null references app_user(id),
  role_code membership_role not null,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint organization_membership_org_user_uq unique (organization_id, user_id)
);

create index if not exists organization_membership_user_idx
  on organization_membership(user_id);
create index if not exists organization_membership_org_idx
  on organization_membership(organization_id);

create table if not exists audit_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organization(id),
  timestamp_utc timestamptz not null default now(),
  actor_user_id uuid references app_user(id),
  actor_membership_id uuid references organization_membership(id),
  actor_display_name_snapshot text,
  ip_address text,
  module_code text not null,
  action_code text not null,
  entity_type text not null,
  entity_id text not null,
  old_value_json jsonb,
  new_value_json jsonb,
  request_id text,
  correlation_id text,
  source_channel text not null,
  reason text
);

create index if not exists audit_event_org_time_idx
  on audit_event(organization_id, timestamp_utc);
create index if not exists audit_event_entity_idx
  on audit_event(entity_type, entity_id);

create table if not exists outbox_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organization(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload_json jsonb not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count bigint not null default 0,
  last_error text
);

create index if not exists outbox_event_pending_idx
  on outbox_event(processed_at, available_at);

create or replace function app_private.prevent_organization_name_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.name is distinct from old.name then
    raise exception 'organization name is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_name_immutable on organization;
create trigger organization_name_immutable
before update on organization
for each row execute function app_private.prevent_organization_name_change();

create or replace function app_private.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.organization_id', true), '')::uuid
$$;

create or replace function app_private.current_membership_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.membership_id', true), '')::uuid
$$;

create or replace function app_private.has_active_context(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.organization_membership m
    join public.app_user u on u.id = m.user_id
    join public.organization o on o.id = m.organization_id
    where m.id = app_private.current_membership_id()
      and m.user_id = app_private.current_user_id()
      and m.organization_id = target_organization_id
      and m.organization_id = app_private.current_organization_id()
      and m.status = 'ACTIVE'
      and u.status = 'ACTIVE'
      and o.status = 'ACTIVE'
  )
$$;

create or replace function app_private.current_role()
returns membership_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.role_code
  from public.organization_membership m
  where m.id = app_private.current_membership_id()
    and m.user_id = app_private.current_user_id()
    and m.organization_id = app_private.current_organization_id()
    and m.status = 'ACTIVE'
    and app_private.has_active_context(m.organization_id)
  limit 1
$$;

revoke all on function app_private.current_user_id() from public;
revoke all on function app_private.current_organization_id() from public;
revoke all on function app_private.current_membership_id() from public;
revoke all on function app_private.has_active_context(uuid) from public;
revoke all on function app_private.current_role() from public;

grant execute on function app_private.current_user_id() to vnext_runtime;
grant execute on function app_private.current_organization_id() to vnext_runtime;
grant execute on function app_private.current_membership_id() to vnext_runtime;
grant execute on function app_private.has_active_context(uuid) to vnext_runtime;
grant execute on function app_private.current_role() to vnext_runtime;

revoke all on organization, app_user, organization_membership, audit_event, outbox_event
  from public, anon, authenticated;

grant select, update on organization to vnext_runtime;
grant select, update on app_user to vnext_runtime;
grant select, insert, update on organization_membership to vnext_runtime;
grant select, insert on audit_event to vnext_runtime;
grant insert on outbox_event to vnext_runtime;

alter table organization enable row level security;
alter table organization force row level security;
alter table app_user enable row level security;
alter table app_user force row level security;
alter table organization_membership enable row level security;
alter table organization_membership force row level security;
alter table audit_event enable row level security;
alter table audit_event force row level security;
alter table outbox_event enable row level security;
alter table outbox_event force row level security;

drop policy if exists organization_select on organization;
create policy organization_select on organization
for select to vnext_runtime
using (
  id = app_private.current_organization_id()
  and app_private.has_active_context(id)
);

drop policy if exists organization_update on organization;
create policy organization_update on organization
for update to vnext_runtime
using (
  id = app_private.current_organization_id()
  and app_private.has_active_context(id)
  and app_private.current_role() = 'ADMIN'
)
with check (
  id = app_private.current_organization_id()
  and app_private.has_active_context(id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists app_user_select on app_user;
create policy app_user_select on app_user
for select to vnext_runtime
using (
  id = app_private.current_user_id()
  and app_private.has_active_context(app_private.current_organization_id())
);

drop policy if exists app_user_update on app_user;
create policy app_user_update on app_user
for update to vnext_runtime
using (
  id = app_private.current_user_id()
  and app_private.has_active_context(app_private.current_organization_id())
)
with check (
  id = app_private.current_user_id()
  and app_private.has_active_context(app_private.current_organization_id())
);

drop policy if exists membership_select on organization_membership;
create policy membership_select on organization_membership
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and (
    app_private.current_role() = 'ADMIN'
    or id = app_private.current_membership_id()
  )
);

drop policy if exists membership_insert on organization_membership;
create policy membership_insert on organization_membership
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists membership_update on organization_membership;
create policy membership_update on organization_membership
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists audit_select on audit_event;
create policy audit_select on audit_event
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists audit_insert on audit_event;
create policy audit_insert on audit_event
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and actor_user_id = app_private.current_user_id()
  and actor_membership_id = app_private.current_membership_id()
  and app_private.has_active_context(organization_id)
);

drop policy if exists outbox_insert on outbox_event;
create policy outbox_insert on outbox_event
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

-- Audit is append-only for normal runtime. No UPDATE/DELETE grants or policies.
