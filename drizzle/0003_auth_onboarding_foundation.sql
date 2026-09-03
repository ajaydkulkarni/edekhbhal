-- vNext Authentication + Guided Onboarding Foundation 01

do $$ begin
  create type commercial_mode as enum ('FREE','SPONSORED','TRIAL','PAID','CUSTOM_CONTRACT');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type subscription_status as enum ('ACTIVE','PENDING_PAYMENT','GRACE','SUSPENDED','CANCELLED');
exception when duplicate_object then null;
end $$;

create table if not exists plan_catalog (
  code text primary key,
  name text not null,
  commercial_mode commercial_mode not null,
  monthly_price_usd_cents bigint not null default 0,
  is_public boolean not null default true,
  is_active boolean not null default true,
  description text
);

create table if not exists organization_subscription (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  plan_code text not null references plan_catalog(code),
  commercial_mode commercial_mode not null,
  status subscription_status not null default 'ACTIVE',
  billing_provider text,
  provider_customer_ref text,
  provider_subscription_ref text,
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint organization_subscription_active_org_uq unique (organization_id)
);

create index if not exists organization_subscription_plan_idx
  on organization_subscription(plan_code);

create table if not exists site (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  name text not null,
  code text not null,
  timezone text not null,
  address_line1 text,
  city text,
  region text,
  postal_code text,
  country_code text not null,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint site_org_code_uq unique (organization_id, code)
);

create index if not exists site_org_idx on site(organization_id);

insert into plan_catalog
  (code, name, commercial_mode, monthly_price_usd_cents, is_public, is_active, description)
values
  ('FREE_BETA', 'Free Beta', 'FREE', 0, true, true, 'Foundation plan for initial onboarding and beta access.'),
  ('STANDARD', 'Standard', 'PAID', 4900, true, true, 'Paid plan prepared for the Stripe adapter increment.'),
  ('PROFESSIONAL', 'Professional', 'PAID', 9900, true, true, 'Expanded paid plan prepared for advanced operations.')
on conflict (code) do update set
  name = excluded.name,
  commercial_mode = excluded.commercial_mode,
  monthly_price_usd_cents = excluded.monthly_price_usd_cents,
  is_public = excluded.is_public,
  is_active = excluded.is_active,
  description = excluded.description;

revoke all on plan_catalog, organization_subscription, site from public, anon, authenticated;
grant select on plan_catalog to vnext_runtime;
grant select, update on organization_subscription to vnext_runtime;
grant select, insert, update on site to vnext_runtime;

alter table organization_subscription enable row level security;
alter table organization_subscription force row level security;
alter table site enable row level security;
alter table site force row level security;

drop policy if exists subscription_select on organization_subscription;
create policy subscription_select on organization_subscription
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

drop policy if exists subscription_update on organization_subscription;
create policy subscription_update on organization_subscription
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

drop policy if exists site_select on site;
create policy site_select on site
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

drop policy if exists site_insert on site;
create policy site_insert on site
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists site_update on site;
create policy site_update on site
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

create or replace function app_private.current_auth_subject()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.auth_subject', true), '')
$$;

revoke all on function app_private.current_auth_subject() from public;
grant execute on function app_private.current_auth_subject() to vnext_runtime;

create or replace function app_private.require_auth_subject()
returns text
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  subject text;
begin
  subject := app_private.current_auth_subject();
  if subject is null then
    raise exception 'authenticated subject context is required';
  end if;
  return subject;
end;
$$;

revoke all on function app_private.require_auth_subject() from public;
grant execute on function app_private.require_auth_subject() to vnext_runtime;

create or replace function app_private.upsert_current_app_user(
  p_email text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  subject text;
  user_id uuid;
begin
  subject := app_private.require_auth_subject();

  insert into public.app_user (auth_subject, email, display_name, status)
  values (
    subject,
    nullif(trim(p_email), ''),
    nullif(trim(p_display_name), ''),
    'ACTIVE'
  )
  on conflict (auth_subject) do update set
    email = coalesce(excluded.email, public.app_user.email),
    display_name = coalesce(excluded.display_name, public.app_user.display_name),
    updated_at = now()
  returning id into user_id;

  return user_id;
end;
$$;

create or replace function app_private.bootstrap_current_organization(
  p_name text,
  p_country_code text,
  p_currency_code text,
  p_timezone text
)
returns table (
  organization_id uuid,
  membership_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  subject text;
  resolved_user_id uuid;
  new_org_id uuid;
  new_membership_id uuid;
begin
  subject := app_private.require_auth_subject();

  select u.id into resolved_user_id
  from public.app_user u
  where u.auth_subject = subject and u.status = 'ACTIVE';

  if resolved_user_id is null then
    raise exception 'profile must be completed before organization creation';
  end if;

  if exists (
    select 1 from public.organization_membership m
    where m.user_id = resolved_user_id and m.status = 'ACTIVE'
  ) then
    raise exception 'initial organization already exists for this user';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'organization name is required';
  end if;

  insert into public.organization
    (name, country_code, default_currency_code, default_timezone, status)
  values
    (trim(p_name), upper(trim(p_country_code)), upper(trim(p_currency_code)), trim(p_timezone), 'ACTIVE')
  returning id into new_org_id;

  insert into public.organization_membership
    (organization_id, user_id, role_code, status)
  values
    (new_org_id, resolved_user_id, 'ADMIN', 'ACTIVE')
  returning id into new_membership_id;

  insert into public.audit_event (
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, new_value_json, source_channel
  )
  select
    new_org_id, resolved_user_id, new_membership_id,
    u.display_name, 'ONBOARDING', 'ORGANIZATION_CREATED',
    'Organization', new_org_id::text,
    jsonb_build_object('name', trim(p_name)),
    'WEB'
  from public.app_user u where u.id = resolved_user_id;

  return query select new_org_id, new_membership_id, resolved_user_id;
end;
$$;

create or replace function app_private.activate_current_free_plan(
  p_organization_id uuid,
  p_plan_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  subject text;
  resolved_user_id uuid;
  resolved_membership_id uuid;
  plan_mode commercial_mode;
  subscription_id uuid;
begin
  subject := app_private.require_auth_subject();

  select u.id, m.id
    into resolved_user_id, resolved_membership_id
  from public.app_user u
  join public.organization_membership m on m.user_id = u.id
  where u.auth_subject = subject
    and u.status = 'ACTIVE'
    and m.organization_id = p_organization_id
    and m.status = 'ACTIVE'
    and m.role_code = 'ADMIN';

  if resolved_membership_id is null then
    raise exception 'active ADMIN membership is required';
  end if;

  select p.commercial_mode into plan_mode
  from public.plan_catalog p
  where p.code = p_plan_code and p.is_active = true;

  if plan_mode not in ('FREE','SPONSORED') then
    raise exception 'paid plan activation requires a billing provider adapter';
  end if;

  insert into public.organization_subscription (
    organization_id, plan_code, commercial_mode, status, activated_at
  )
  values (
    p_organization_id, p_plan_code, plan_mode, 'ACTIVE', now()
  )
  on conflict (organization_id) do update set
    plan_code = excluded.plan_code,
    commercial_mode = excluded.commercial_mode,
    status = 'ACTIVE',
    billing_provider = null,
    provider_customer_ref = null,
    provider_subscription_ref = null,
    activated_at = now(),
    updated_at = now(),
    version = public.organization_subscription.version + 1
  returning id into subscription_id;

  insert into public.audit_event (
    organization_id, actor_user_id, actor_membership_id,
    module_code, action_code, entity_type, entity_id,
    new_value_json, source_channel
  )
  values (
    p_organization_id, resolved_user_id, resolved_membership_id,
    'BILLING', 'FREE_PLAN_ACTIVATED', 'OrganizationSubscription', subscription_id::text,
    jsonb_build_object('planCode', p_plan_code, 'commercialMode', plan_mode),
    'WEB'
  );

  return subscription_id;
end;
$$;

create or replace function app_private.create_current_first_site(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_timezone text,
  p_country_code text,
  p_address_line1 text default null,
  p_city text default null,
  p_region text default null,
  p_postal_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  subject text;
  resolved_user_id uuid;
  resolved_membership_id uuid;
  site_id uuid;
begin
  subject := app_private.require_auth_subject();

  select u.id, m.id
    into resolved_user_id, resolved_membership_id
  from public.app_user u
  join public.organization_membership m on m.user_id = u.id
  where u.auth_subject = subject
    and u.status = 'ACTIVE'
    and m.organization_id = p_organization_id
    and m.status = 'ACTIVE'
    and m.role_code = 'ADMIN';

  if resolved_membership_id is null then
    raise exception 'active ADMIN membership is required';
  end if;

  if not exists (
    select 1 from public.organization_subscription s
    where s.organization_id = p_organization_id and s.status = 'ACTIVE'
  ) then
    raise exception 'an active subscription or grant is required before site creation';
  end if;

  if exists (
    select 1 from public.site s
    where s.organization_id = p_organization_id
  ) then
    raise exception 'first site already exists';
  end if;

  insert into public.site (
    organization_id, name, code, timezone, country_code,
    address_line1, city, region, postal_code, status
  )
  values (
    p_organization_id, trim(p_name), upper(trim(p_code)), trim(p_timezone),
    upper(trim(p_country_code)), nullif(trim(p_address_line1), ''),
    nullif(trim(p_city), ''), nullif(trim(p_region), ''),
    nullif(trim(p_postal_code), ''), 'ACTIVE'
  )
  returning id into site_id;

  insert into public.audit_event (
    organization_id, actor_user_id, actor_membership_id,
    module_code, action_code, entity_type, entity_id,
    new_value_json, source_channel
  )
  values (
    p_organization_id, resolved_user_id, resolved_membership_id,
    'SITE', 'SITE_CREATED', 'Site', site_id::text,
    jsonb_build_object('name', trim(p_name), 'code', upper(trim(p_code))),
    'WEB'
  );

  return site_id;
end;
$$;

create or replace function app_private.get_current_onboarding_snapshot()
returns table (
  app_user_id uuid,
  display_name text,
  organization_id uuid,
  organization_name text,
  membership_id uuid,
  role_code membership_role,
  plan_code text,
  subscription_state subscription_status,
  site_id uuid,
  site_name text,
  onboarding_state text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  subject text;
begin
  subject := app_private.require_auth_subject();

  return query
  with current_user_row as (
    select u.*
    from public.app_user u
    where u.auth_subject = subject and u.status = 'ACTIVE'
    limit 1
  ),
  first_membership as (
    select m.*
    from public.organization_membership m
    join current_user_row u on u.id = m.user_id
    where m.status = 'ACTIVE'
    order by m.created_at, m.id
    limit 1
  ),
  first_subscription as (
    select s.*
    from public.organization_subscription s
    join first_membership m on m.organization_id = s.organization_id
    order by s.created_at, s.id
    limit 1
  ),
  first_site as (
    select s.*
    from public.site s
    join first_membership m on m.organization_id = s.organization_id
    where s.status = 'ACTIVE'
    order by s.created_at, s.id
    limit 1
  )
  select
    u.id,
    u.display_name,
    o.id,
    o.name,
    m.id,
    m.role_code,
    sub.plan_code,
    sub.status,
    st.id,
    st.name,
    case
      when u.id is null or nullif(trim(u.display_name), '') is null then 'REGISTERED'
      when m.id is null then 'PROFILE_COMPLETED'
      when sub.id is null then 'ORGANIZATION_CREATED'
      when sub.status <> 'ACTIVE' then 'PLAN_SELECTED'
      when st.id is null and sub.commercial_mode in ('FREE','SPONSORED') then 'FREE_OR_SPONSORED_ACTIVATED'
      when st.id is null then 'BILLING_COMPLETE'
      else 'ONBOARDING_COMPLETE'
    end
  from (select 1) seed
  left join current_user_row u on true
  left join first_membership m on true
  left join public.organization o on o.id = m.organization_id
  left join first_subscription sub on true
  left join first_site st on true;
end;
$$;

revoke all on function app_private.upsert_current_app_user(text,text) from public;
revoke all on function app_private.bootstrap_current_organization(text,text,text,text) from public;
revoke all on function app_private.activate_current_free_plan(uuid,text) from public;
revoke all on function app_private.create_current_first_site(uuid,text,text,text,text,text,text,text,text) from public;
revoke all on function app_private.get_current_onboarding_snapshot() from public;

grant execute on function app_private.upsert_current_app_user(text,text) to vnext_runtime;
grant execute on function app_private.bootstrap_current_organization(text,text,text,text) to vnext_runtime;
grant execute on function app_private.activate_current_free_plan(uuid,text) to vnext_runtime;
grant execute on function app_private.create_current_first_site(uuid,text,text,text,text,text,text,text,text) to vnext_runtime;
grant execute on function app_private.get_current_onboarding_snapshot() to vnext_runtime;

-- Keep future tables fail-closed: no broad runtime defaults.
alter default privileges in schema public revoke all on tables from vnext_runtime;
alter default privileges in schema public revoke all on sequences from vnext_runtime;
