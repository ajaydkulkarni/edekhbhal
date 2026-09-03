-- Task Master Foundation 01

create table if not exists task_master (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  name text not null,
  instructions_html text not null default '',
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint task_master_name_not_blank check (length(trim(name)) > 0),
  constraint task_master_instructions_size check (length(instructions_html) <= 50000)
);

create index if not exists task_master_org_status_name_idx
  on task_master(organization_id, status, name);

create table if not exists task_attachment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  task_id uuid not null references task_master(id),
  storage_provider text not null,
  storage_bucket text not null,
  storage_key text not null,
  original_filename text not null,
  media_type text,
  byte_size bigint,
  sha256_hex text,
  created_at timestamptz not null default now(),
  constraint task_attachment_storage_uq unique(organization_id, storage_bucket, storage_key),
  constraint task_attachment_byte_size_nonnegative check (byte_size is null or byte_size >= 0),
  constraint task_attachment_sha256_format check (
    sha256_hex is null or sha256_hex ~ '^[a-f0-9]{64}$'
  )
);

create index if not exists task_attachment_org_task_idx
  on task_attachment(organization_id, task_id);

create or replace function app_private.can_manage_tasks()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    app_private.current_role() = 'ADMIN'
    or (
      app_private.current_role() = 'SITE_MANAGER'
      and exists (
        select 1
        from public.site_membership_scope sms
        where sms.organization_id = app_private.current_organization_id()
          and sms.membership_id = app_private.current_membership_id()
      )
    )
$$;

revoke all on function app_private.can_manage_tasks() from public;
grant execute on function app_private.can_manage_tasks() to vnext_runtime;

revoke all on task_master, task_attachment from public, anon, authenticated, vnext_runtime;
grant select, insert, update on task_master to vnext_runtime;
grant select on task_attachment to vnext_runtime;

alter table task_master enable row level security;
alter table task_master force row level security;
alter table task_attachment enable row level security;
alter table task_attachment force row level security;

drop policy if exists task_master_select on task_master;
create policy task_master_select on task_master
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

drop policy if exists task_master_insert on task_master;
create policy task_master_insert on task_master
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.can_manage_tasks()
);

drop policy if exists task_master_update on task_master;
create policy task_master_update on task_master
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.can_manage_tasks()
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.can_manage_tasks()
);

drop policy if exists task_attachment_select on task_attachment;
create policy task_attachment_select on task_attachment
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

create or replace function app_private.create_task_master(
  p_name text,
  p_instructions_html text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  org_id uuid := app_private.current_organization_id();
  existing jsonb;
  new_task_id uuid;
  actor_name text;
  normalized_name text := trim(p_name);
  normalized_html text := coalesce(p_instructions_html, '');
begin
  if not app_private.can_manage_tasks() then
    raise exception 'Task management permission is required';
  end if;
  if nullif(normalized_name, '') is null then
    raise exception 'Task name is required';
  end if;
  if length(normalized_name) > 160 then
    raise exception 'Task name is too long';
  end if;
  if length(normalized_html) > 50000 then
    raise exception 'Task instructions are too long';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws('|', org_id::text, 'TASK_CREATE', trim(p_idempotency_key)),
      0
    )
  );

  select result_json into existing
  from public.operation_idempotency
  where organization_id = org_id
    and operation_code = 'TASK_CREATE'
    and idempotency_key = trim(p_idempotency_key);

  if existing is not null then
    return (existing->>'taskId')::uuid;
  end if;

  insert into public.task_master(
    organization_id, name, instructions_html, status
  ) values (
    org_id, normalized_name, normalized_html, 'ACTIVE'
  )
  returning id into new_task_id;

  insert into public.operation_idempotency(
    organization_id, operation_code, idempotency_key, result_json
  ) values (
    org_id, 'TASK_CREATE', trim(p_idempotency_key),
    jsonb_build_object('taskId', new_task_id)
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
    actor_name, 'TASK', 'TASK_CREATED',
    'Task', new_task_id::text, null,
    jsonb_build_object(
      'name', normalized_name,
      'instructionsHtml', normalized_html,
      'status', 'ACTIVE',
      'version', 1
    ),
    'WEB'
  );

  return new_task_id;
end;
$$;

create or replace function app_private.update_task_master(
  p_task_id uuid,
  p_name text,
  p_instructions_html text,
  p_expected_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_row public.task_master%rowtype;
  new_version bigint;
  actor_name text;
  normalized_name text := trim(p_name);
  normalized_html text := coalesce(p_instructions_html, '');
begin
  if not app_private.can_manage_tasks() then
    raise exception 'Task management permission is required';
  end if;
  if nullif(normalized_name, '') is null then
    raise exception 'Task name is required';
  end if;
  if length(normalized_name) > 160 then
    raise exception 'Task name is too long';
  end if;
  if length(normalized_html) > 50000 then
    raise exception 'Task instructions are too long';
  end if;

  select * into old_row
  from public.task_master
  where id = p_task_id
  for update;

  if old_row.id is null then raise exception 'Task not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  update public.task_master
  set
    name = normalized_name,
    instructions_html = normalized_html,
    updated_at = now(),
    version = version + 1
  where id = p_task_id
    and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  select display_name into actor_name
  from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    old_row.organization_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'TASK', 'TASK_UPDATED',
    'Task', old_row.id::text,
    jsonb_build_object(
      'name', old_row.name,
      'instructionsHtml', old_row.instructions_html,
      'status', old_row.status,
      'version', old_row.version
    ),
    jsonb_build_object(
      'name', normalized_name,
      'instructionsHtml', normalized_html,
      'status', old_row.status,
      'version', new_version
    ),
    'WEB'
  );

  return new_version;
end;
$$;

create or replace function app_private.set_task_master_status(
  p_task_id uuid,
  p_status record_status,
  p_expected_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_row public.task_master%rowtype;
  new_version bigint;
  actor_name text;
begin
  if not app_private.can_manage_tasks() then
    raise exception 'Task management permission is required';
  end if;

  select * into old_row
  from public.task_master
  where id = p_task_id
  for update;

  if old_row.id is null then raise exception 'Task not found'; end if;
  if old_row.version <> p_expected_version then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  update public.task_master
  set
    status = p_status,
    updated_at = now(),
    version = version + 1
  where id = p_task_id
    and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    raise exception 'Task changed by another user; refresh and retry';
  end if;

  select display_name into actor_name
  from public.app_user
  where id = app_private.current_user_id();

  insert into public.audit_event(
    organization_id, actor_user_id, actor_membership_id,
    actor_display_name_snapshot, module_code, action_code,
    entity_type, entity_id, old_value_json, new_value_json, source_channel
  ) values (
    old_row.organization_id, app_private.current_user_id(), app_private.current_membership_id(),
    actor_name, 'TASK', 'TASK_STATUS_CHANGED',
    'Task', old_row.id::text,
    jsonb_build_object(
      'name', old_row.name,
      'status', old_row.status,
      'version', old_row.version
    ),
    jsonb_build_object(
      'name', old_row.name,
      'status', p_status,
      'version', new_version
    ),
    'WEB'
  );

  return new_version;
end;
$$;

revoke all on function app_private.create_task_master(text,text,text) from public;
revoke all on function app_private.update_task_master(uuid,text,text,bigint) from public;
revoke all on function app_private.set_task_master_status(uuid,record_status,bigint) from public;

grant execute on function app_private.create_task_master(text,text,text) to vnext_runtime;
grant execute on function app_private.update_task_master(uuid,text,text,bigint) to vnext_runtime;
grant execute on function app_private.set_task_master_status(uuid,record_status,bigint) to vnext_runtime;

alter default privileges in schema public revoke all on tables from vnext_runtime;
alter default privileges in schema public revoke all on sequences from vnext_runtime;
