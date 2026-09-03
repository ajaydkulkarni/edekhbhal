-- Work Area + QR public token hotfix 01
-- Avoids dependency on pgcrypto.gen_random_bytes() being present in the function search_path.
-- Two UUIDv4 values provide more entropy than the 192-bit public token we expose.

create or replace function app_private.new_public_qr_token()
returns text
language sql
volatile
set search_path = pg_catalog
as $$
  select substring(
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
    from 1 for 48
  )
$$;

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

revoke all on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) from public;
revoke all on function app_private.regenerate_work_area_qr(uuid,text) from public;
grant execute on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) to vnext_runtime;
grant execute on function app_private.regenerate_work_area_qr(uuid,text) to vnext_runtime;
