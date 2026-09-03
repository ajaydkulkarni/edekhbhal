-- Work Area + QR Lifecycle Foundation 01

do $$ begin
  create type qr_status as enum ('ACTIVE','REVOKED');
exception when duplicate_object then null;
end $$;

create table if not exists site_membership_scope (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  site_id uuid not null references site(id),
  membership_id uuid not null references organization_membership(id),
  created_at timestamptz not null default now(),
  constraint site_membership_scope_site_membership_uq unique(site_id, membership_id)
);
create index if not exists site_membership_scope_org_idx on site_membership_scope(organization_id);
create index if not exists site_membership_scope_membership_idx on site_membership_scope(membership_id);

create table if not exists work_area (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  site_id uuid not null references site(id),
  name text not null,
  code text not null,
  description text,
  location_details text,
  working_hours_json jsonb,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint work_area_site_code_uq unique(site_id, code)
);
create index if not exists work_area_org_site_idx on work_area(organization_id, site_id);

create table if not exists work_area_qr (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  site_id uuid not null references site(id),
  work_area_id uuid not null references work_area(id),
  public_token text not null unique,
  status qr_status not null default 'ACTIVE',
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  version bigint not null default 1
);
create index if not exists work_area_qr_org_idx on work_area_qr(organization_id);
create index if not exists work_area_qr_work_area_idx on work_area_qr(work_area_id);
create unique index if not exists work_area_qr_one_active_uq
  on work_area_qr(work_area_id) where status = 'ACTIVE';

create table if not exists operation_idempotency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  operation_code text not null,
  idempotency_key text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint operation_idempotency_org_operation_key_uq
    unique(organization_id, operation_code, idempotency_key)
);

create or replace function app_private.has_site_access(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.organization_membership m
    join public.site s on s.organization_id = m.organization_id
    where m.id = app_private.current_membership_id()
      and m.user_id = app_private.current_user_id()
      and m.organization_id = app_private.current_organization_id()
      and m.status = 'ACTIVE'
      and s.id = p_site_id
      and s.organization_id = m.organization_id
      and s.status = 'ACTIVE'
      and (
        m.role_code = 'ADMIN'
        or exists (
          select 1 from public.site_membership_scope sms
          where sms.organization_id = m.organization_id
            and sms.site_id = s.id
            and sms.membership_id = m.id
        )
      )
  )
$$;

revoke all on function app_private.has_site_access(uuid) from public;
grant execute on function app_private.has_site_access(uuid) to vnext_runtime;

revoke all on site_membership_scope, work_area, work_area_qr, operation_idempotency
  from public, anon, authenticated, vnext_runtime;

grant select on site_membership_scope to vnext_runtime;
grant select, insert, update on work_area to vnext_runtime;
grant select, insert, update on work_area_qr to vnext_runtime;
grant select, insert on operation_idempotency to vnext_runtime;

alter table site_membership_scope enable row level security;
alter table site_membership_scope force row level security;
alter table work_area enable row level security;
alter table work_area force row level security;
alter table work_area_qr enable row level security;
alter table work_area_qr force row level security;
alter table operation_idempotency enable row level security;
alter table operation_idempotency force row level security;

drop policy if exists site_scope_select on site_membership_scope;
create policy site_scope_select on site_membership_scope
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and (
    app_private.current_role() = 'ADMIN'
    or membership_id = app_private.current_membership_id()
  )
);

drop policy if exists work_area_select on work_area;
create policy work_area_select on work_area
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
);

drop policy if exists work_area_insert on work_area;
create policy work_area_insert on work_area
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists work_area_update on work_area;
create policy work_area_update on work_area
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists work_area_qr_select on work_area_qr;
create policy work_area_qr_select on work_area_qr
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
);

drop policy if exists work_area_qr_insert on work_area_qr;
create policy work_area_qr_insert on work_area_qr
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists work_area_qr_update on work_area_qr;
create policy work_area_qr_update on work_area_qr
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists operation_idempotency_select on operation_idempotency;
create policy operation_idempotency_select on operation_idempotency
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

drop policy if exists operation_idempotency_insert on operation_idempotency;
create policy operation_idempotency_insert on operation_idempotency
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

create or replace function app_private.new_public_qr_token()
returns text
language sql
volatile
set search_path = pg_catalog
as $
  select substring(
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
    from 1 for 48
  )
$;

revoke all on function app_private.new_public_qr_token() from public;
grant execute on function app_private.new_public_qr_token() to vnext_runtime;

create or replace function app_private.create_work_area_with_qr(
  p_site_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_location_details text,
  p_idempotency_key text
)
returns table(work_area_id uuid, qr_id uuid, public_token text)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  existing jsonb;
  new_work_area_id uuid;
  new_qr_id uuid;
  new_token text;
  actor_name text;
begin
  if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then
    raise exception 'ADMIN or SITE_MANAGER role is required';
  end if;
  if not app_private.has_site_access(p_site_id) then
    raise exception 'Site access is required';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_code), '') is null then
    raise exception 'Work Area name and code are required';
  end if;

  select result_json into existing
  from public.operation_idempotency
  where organization_id = org_id
    and operation_code = 'WORK_AREA_CREATE'
    and idempotency_key = p_idempotency_key;

  if existing is not null then
    return query select
      (existing->>'workAreaId')::uuid,
      (existing->>'qrId')::uuid,
      existing->>'publicToken';
    return;
  end if;

  insert into public.work_area(
    organization_id, site_id, name, code, description, location_details, status
  ) values (
    org_id, p_site_id, trim(p_name), upper(trim(p_code)),
    nullif(trim(p_description), ''), nullif(trim(p_location_details), ''), 'ACTIVE'
  ) returning id into new_work_area_id;

  new_token := app_private.new_public_qr_token();
  insert into public.work_area_qr(
    organization_id, site_id, work_area_id, public_token, status
  ) values (
    org_id, p_site_id, new_work_area_id, new_token, 'ACTIVE'
  ) returning id into new_qr_id;

  insert into public.operation_idempotency(
    organization_id, operation_code, idempotency_key, result_json
  ) values (
    org_id, 'WORK_AREA_CREATE', p_idempotency_key,
    jsonb_build_object(
      'workAreaId', new_work_area_id,
      'qrId', new_qr_id,
      'publicToken', new_token
    )
  );

  select display_name into actor_name from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    org_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'WORK_AREA', 'WORK_AREA_CREATED',
    'WorkArea', new_work_area_id::text, null,
    jsonb_build_object(
      'siteId', p_site_id,
      'name', trim(p_name),
      'code', upper(trim(p_code)),
      'status', 'ACTIVE'
    ),
    'WEB'
  );

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    org_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'QR', 'QR_ISSUED',
    'WorkAreaQr', new_qr_id::text, null,
    jsonb_build_object('workAreaId', new_work_area_id, 'status', 'ACTIVE'),
    'WEB'
  );

  return query select new_work_area_id, new_qr_id, new_token;
end;
$$;

create or replace function app_private.set_work_area_status(
  p_work_area_id uuid,
  p_status record_status,
  p_expected_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_row public.work_area%rowtype;
  new_version bigint;
  actor_name text;
begin
  select * into old_row from public.work_area
  where id = p_work_area_id for update;

  if old_row.id is null then raise exception 'Work Area not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Work Area changed by another user; refresh and retry';
  end if;

  update public.work_area
  set status = p_status, updated_at = now(), version = version + 1
  where id = p_work_area_id and version = p_expected_version
  returning version into new_version;

  select display_name into actor_name from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    old_row.organization_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'WORK_AREA', 'WORK_AREA_STATUS_CHANGED',
    'WorkArea', old_row.id::text,
    jsonb_build_object('status', old_row.status, 'version', old_row.version),
    jsonb_build_object('status', p_status, 'version', new_version),
    'WEB'
  );

  return new_version;
end;
$$;

create or replace function app_private.regenerate_work_area_qr(
  p_work_area_id uuid,
  p_idempotency_key text
)
returns table(qr_id uuid, public_token text)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  wa public.work_area%rowtype;
  old_qr public.work_area_qr%rowtype;
  existing jsonb;
  new_qr_id uuid;
  new_token text;
  actor_name text;
begin
  select result_json into existing
  from public.operation_idempotency
  where organization_id = org_id
    and operation_code = 'QR_REGENERATE'
    and idempotency_key = p_idempotency_key;

  if existing is not null then
    return query select (existing->>'qrId')::uuid, existing->>'publicToken';
    return;
  end if;

  select * into wa from public.work_area where id = p_work_area_id for update;
  if wa.id is null then raise exception 'Work Area not found'; end if;
  if wa.status <> 'ACTIVE' then raise exception 'Cannot regenerate QR for an inactive Work Area'; end if;

  select * into old_qr from public.work_area_qr
  where work_area_id = p_work_area_id and status = 'ACTIVE'
  for update;

  if old_qr.id is null then raise exception 'Active QR not found'; end if;

  update public.work_area_qr
  set status = 'REVOKED', revoked_at = now(), version = version + 1
  where id = old_qr.id;

  new_token := app_private.new_public_qr_token();
  insert into public.work_area_qr(
    organization_id, site_id, work_area_id, public_token, status
  ) values (
    wa.organization_id, wa.site_id, wa.id, new_token, 'ACTIVE'
  ) returning id into new_qr_id;

  insert into public.operation_idempotency(
    organization_id, operation_code, idempotency_key, result_json
  ) values (
    org_id, 'QR_REGENERATE', p_idempotency_key,
    jsonb_build_object('qrId', new_qr_id, 'publicToken', new_token)
  );

  select display_name into actor_name from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    org_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'QR', 'QR_REGENERATED',
    'WorkArea', wa.id::text,
    jsonb_build_object('qrId', old_qr.id, 'status', 'ACTIVE'),
    jsonb_build_object('qrId', new_qr_id, 'status', 'ACTIVE'),
    'WEB'
  );

  return query select new_qr_id, new_token;
end;
$$;

create or replace function app_private.resolve_public_work_area_qr(p_token text)
returns table(
  organization_name text,
  site_name text,
  work_area_name text,
  work_area_description text,
  location_details text,
  service_status text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    o.name,
    s.name,
    w.name,
    w.description,
    w.location_details,
    case when o.status = 'ACTIVE' and s.status = 'ACTIVE' and w.status = 'ACTIVE'
      then 'ACTIVE' else 'INACTIVE' end
  from public.work_area_qr q
  join public.work_area w on w.id = q.work_area_id and w.organization_id = q.organization_id
  join public.site s on s.id = q.site_id and s.organization_id = q.organization_id
  join public.organization o on o.id = q.organization_id
  where q.public_token = p_token
    and q.status = 'ACTIVE'
  limit 1
$$;

revoke all on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) from public;
revoke all on function app_private.set_work_area_status(uuid,record_status,bigint) from public;
revoke all on function app_private.regenerate_work_area_qr(uuid,text) from public;
revoke all on function app_private.resolve_public_work_area_qr(text) from public;

grant execute on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) to vnext_runtime;
grant execute on function app_private.set_work_area_status(uuid,record_status,bigint) to vnext_runtime;
grant execute on function app_private.regenerate_work_area_qr(uuid,text) to vnext_runtime;
grant execute on function app_private.resolve_public_work_area_qr(text) to vnext_runtime;

alter default privileges in schema public revoke all on tables from vnext_runtime;
alter default privileges in schema public revoke all on sequences from vnext_runtime;
