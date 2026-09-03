-- Work Area + QR Hardening 02
-- Narrows Site visibility to assignment scope, preserves historical management visibility
-- for inactive Sites, restricts idempotency rows, and serializes same-key commands.

create or replace function app_private.has_site_scope(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.organization_membership m
    join public.site s
      on s.id = p_site_id
     and s.organization_id = m.organization_id
    where m.id = app_private.current_membership_id()
      and m.user_id = app_private.current_user_id()
      and m.organization_id = app_private.current_organization_id()
      and m.status = 'ACTIVE'
      and (
        m.role_code = 'ADMIN'
        or exists (
          select 1
          from public.site_membership_scope sms
          where sms.organization_id = m.organization_id
            and sms.site_id = s.id
            and sms.membership_id = m.id
        )
      )
  )
$$;

create or replace function app_private.has_active_site_access(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.has_site_scope(p_site_id)
    and exists (
      select 1
      from public.site s
      where s.id = p_site_id
        and s.organization_id = app_private.current_organization_id()
        and s.status = 'ACTIVE'
    )
$$;

-- Preserve the original helper name for compatibility, but make its active-state
-- semantics explicit. Historical reads use has_site_scope instead.
create or replace function app_private.has_site_access(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.has_active_site_access(p_site_id)
$$;

revoke all on function app_private.has_site_scope(uuid) from public;
revoke all on function app_private.has_active_site_access(uuid) from public;
revoke all on function app_private.has_site_access(uuid) from public;
grant execute on function app_private.has_site_scope(uuid) to vnext_runtime;
grant execute on function app_private.has_active_site_access(uuid) to vnext_runtime;
grant execute on function app_private.has_site_access(uuid) to vnext_runtime;

drop policy if exists site_select on public.site;
create policy site_select on public.site
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(id)
);

drop policy if exists site_insert on public.site;
create policy site_insert on public.site
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists site_update on public.site;
create policy site_update on public.site
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and (
    app_private.current_role() = 'ADMIN'
    or (
      app_private.current_role() = 'SITE_MANAGER'
      and app_private.has_site_scope(id)
    )
  )
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and (
    app_private.current_role() = 'ADMIN'
    or (
      app_private.current_role() = 'SITE_MANAGER'
      and app_private.has_site_scope(id)
    )
  )
);

drop policy if exists work_area_select on public.work_area;
create policy work_area_select on public.work_area
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
);

drop policy if exists work_area_insert on public.work_area;
create policy work_area_insert on public.work_area
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_active_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists work_area_update on public.work_area;
create policy work_area_update on public.work_area
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists work_area_qr_select on public.work_area_qr;
create policy work_area_qr_select on public.work_area_qr
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
);

drop policy if exists work_area_qr_insert on public.work_area_qr;
create policy work_area_qr_insert on public.work_area_qr
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_active_site_access(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists work_area_qr_update on public.work_area_qr;
create policy work_area_qr_update on public.work_area_qr
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.has_site_scope(site_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists operation_idempotency_select on public.operation_idempotency;
create policy operation_idempotency_select on public.operation_idempotency
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

drop policy if exists operation_idempotency_insert on public.operation_idempotency;
create policy operation_idempotency_insert on public.operation_idempotency
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() in ('ADMIN','SITE_MANAGER')
);

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
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws('|', org_id::text, 'WORK_AREA_CREATE', trim(p_idempotency_key)),
      0
    )
  );

  select result_json into existing
  from public.operation_idempotency
  where organization_id = org_id
    and operation_code = 'WORK_AREA_CREATE'
    and idempotency_key = trim(p_idempotency_key);

  if existing is not null then
    return query select
      (existing->>'workAreaId')::uuid,
      (existing->>'qrId')::uuid,
      existing->>'publicToken';
    return;
  end if;

  if not app_private.has_active_site_access(p_site_id) then
    raise exception 'Active Site access is required';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_code), '') is null then
    raise exception 'Work Area name and code are required';
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
    org_id, 'WORK_AREA_CREATE', trim(p_idempotency_key),
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
  if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then
    raise exception 'ADMIN or SITE_MANAGER role is required';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws('|', org_id::text, 'QR_REGENERATE', trim(p_idempotency_key)),
      0
    )
  );

  select result_json into existing
  from public.operation_idempotency
  where organization_id = org_id
    and operation_code = 'QR_REGENERATE'
    and idempotency_key = trim(p_idempotency_key);

  if existing is not null then
    return query select (existing->>'qrId')::uuid, existing->>'publicToken';
    return;
  end if;

  select * into wa
  from public.work_area
  where id = p_work_area_id
  for update;

  if wa.id is null then raise exception 'Work Area not found'; end if;
  if wa.organization_id <> org_id then raise exception 'Work Area not found'; end if;
  if not app_private.has_active_site_access(wa.site_id) then
    raise exception 'Active Site access is required';
  end if;
  if wa.status <> 'ACTIVE' then
    raise exception 'Cannot regenerate QR for an inactive Work Area';
  end if;

  select * into old_qr
  from public.work_area_qr
  where work_area_id = p_work_area_id
    and status = 'ACTIVE'
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
    org_id, 'QR_REGENERATE', trim(p_idempotency_key),
    jsonb_build_object('qrId', new_qr_id, 'publicToken', new_token)
  );

  select display_name into actor_name
  from public.app_user
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

revoke all on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) from public;
revoke all on function app_private.regenerate_work_area_qr(uuid,text) from public;
grant execute on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) to vnext_runtime;
grant execute on function app_private.regenerate_work_area_qr(uuid,text) to vnext_runtime;
