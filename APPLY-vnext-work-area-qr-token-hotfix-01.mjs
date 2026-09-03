import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const migrationPath = "drizzle/0004_work_area_qr_foundation.sql";
if (!fs.existsSync(migrationPath)) throw new Error(`${migrationPath} is missing. Apply Foundation 01 first.`);

let original = fs.readFileSync(migrationPath, "utf8");
const bad = "encode(gen_random_bytes(24), 'hex')";
const good = "app_private.new_public_qr_token()";
const count = original.split(bad).length - 1;

if (count === 2) {
  // Keep the base migration replay-safe by defining the helper before the two business functions.
  const anchor = "create or replace function app_private.create_work_area_with_qr(";
  const helper = `create or replace function app_private.new_public_qr_token()
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

`;
  if (!original.includes("function app_private.new_public_qr_token()")) {
    original = original.replace(anchor, helper + anchor);
  }
  original = original.split(bad).join(good);
  fs.writeFileSync(migrationPath, original, "utf8");
} else if (!original.includes(good)) {
  throw new Error(`Expected two gen_random_bytes token expressions, found ${count}.`);
}

const writes = {
  "drizzle/0005_work_area_qr_token_hotfix.sql": "-- Work Area + QR public token hotfix 01\n-- Avoids dependency on pgcrypto.gen_random_bytes() being present in the function search_path.\n-- Two UUIDv4 values provide more entropy than the 192-bit public token we expose.\n\ncreate or replace function app_private.new_public_qr_token()\nreturns text\nlanguage sql\nvolatile\nset search_path = pg_catalog\nas $$\n  select substring(\n    replace(gen_random_uuid()::text, '-', '') ||\n    replace(gen_random_uuid()::text, '-', '')\n    from 1 for 48\n  )\n$$;\n\nrevoke all on function app_private.new_public_qr_token() from public;\ngrant execute on function app_private.new_public_qr_token() to vnext_runtime;\n\ncreate or replace function app_private.create_work_area_with_qr(\n  p_site_id uuid,\n  p_name text,\n  p_code text,\n  p_description text,\n  p_location_details text,\n  p_idempotency_key text\n)\nreturns table(work_area_id uuid, qr_id uuid, public_token text)\nlanguage plpgsql\nsecurity invoker\nset search_path = pg_catalog, public\nas $$\ndeclare\n  org_id uuid := app_private.current_organization_id();\n  existing jsonb;\n  new_work_area_id uuid;\n  new_qr_id uuid;\n  new_token text;\n  actor_name text;\nbegin\n  if app_private.current_role() not in ('ADMIN','SITE_MANAGER') then\n    raise exception 'ADMIN or SITE_MANAGER role is required';\n  end if;\n  if not app_private.has_site_access(p_site_id) then\n    raise exception 'Site access is required';\n  end if;\n  if nullif(trim(p_name), '') is null or nullif(trim(p_code), '') is null then\n    raise exception 'Work Area name and code are required';\n  end if;\n\n  select result_json into existing\n  from public.operation_idempotency\n  where organization_id = org_id\n    and operation_code = 'WORK_AREA_CREATE'\n    and idempotency_key = p_idempotency_key;\n\n  if existing is not null then\n    return query select\n      (existing->>'workAreaId')::uuid,\n      (existing->>'qrId')::uuid,\n      existing->>'publicToken';\n    return;\n  end if;\n\n  insert into public.work_area(\n    organization_id, site_id, name, code, description, location_details, status\n  ) values (\n    org_id, p_site_id, trim(p_name), upper(trim(p_code)),\n    nullif(trim(p_description), ''), nullif(trim(p_location_details), ''), 'ACTIVE'\n  ) returning id into new_work_area_id;\n\n  new_token := app_private.new_public_qr_token();\n  insert into public.work_area_qr(\n    organization_id, site_id, work_area_id, public_token, status\n  ) values (\n    org_id, p_site_id, new_work_area_id, new_token, 'ACTIVE'\n  ) returning id into new_qr_id;\n\n  insert into public.operation_idempotency(\n    organization_id, operation_code, idempotency_key, result_json\n  ) values (\n    org_id, 'WORK_AREA_CREATE', p_idempotency_key,\n    jsonb_build_object(\n      'workAreaId', new_work_area_id,\n      'qrId', new_qr_id,\n      'publicToken', new_token\n    )\n  );\n\n  select display_name into actor_name from public.app_user\n  where id = app_private.current_user_id();\n\n  insert into public.audit_event(\n    organization_id, actor_user_id, actor_membership_id,\n    actor_display_name_snapshot, module_code, action_code,\n    entity_type, entity_id, old_value_json, new_value_json, source_channel\n  ) values (\n    org_id, app_private.current_user_id(), app_private.current_membership_id(),\n    actor_name, 'WORK_AREA', 'WORK_AREA_CREATED',\n    'WorkArea', new_work_area_id::text, null,\n    jsonb_build_object(\n      'siteId', p_site_id,\n      'name', trim(p_name),\n      'code', upper(trim(p_code)),\n      'status', 'ACTIVE'\n    ),\n    'WEB'\n  );\n\n  insert into public.audit_event(\n    organization_id, actor_user_id, actor_membership_id,\n    actor_display_name_snapshot, module_code, action_code,\n    entity_type, entity_id, old_value_json, new_value_json, source_channel\n  ) values (\n    org_id, app_private.current_user_id(), app_private.current_membership_id(),\n    actor_name, 'QR', 'QR_ISSUED',\n    'WorkAreaQr', new_qr_id::text, null,\n    jsonb_build_object('workAreaId', new_work_area_id, 'status', 'ACTIVE'),\n    'WEB'\n  );\n\n  return query select new_work_area_id, new_qr_id, new_token;\nend;\n$$;\n\ncreate or replace function app_private.regenerate_work_area_qr(\n  p_work_area_id uuid,\n  p_idempotency_key text\n)\nreturns table(qr_id uuid, public_token text)\nlanguage plpgsql\nsecurity invoker\nset search_path = pg_catalog, public\nas $$\ndeclare\n  org_id uuid := app_private.current_organization_id();\n  wa public.work_area%rowtype;\n  old_qr public.work_area_qr%rowtype;\n  existing jsonb;\n  new_qr_id uuid;\n  new_token text;\n  actor_name text;\nbegin\n  select result_json into existing\n  from public.operation_idempotency\n  where organization_id = org_id\n    and operation_code = 'QR_REGENERATE'\n    and idempotency_key = p_idempotency_key;\n\n  if existing is not null then\n    return query select (existing->>'qrId')::uuid, existing->>'publicToken';\n    return;\n  end if;\n\n  select * into wa from public.work_area where id = p_work_area_id for update;\n  if wa.id is null then raise exception 'Work Area not found'; end if;\n  if wa.status <> 'ACTIVE' then raise exception 'Cannot regenerate QR for an inactive Work Area'; end if;\n\n  select * into old_qr from public.work_area_qr\n  where work_area_id = p_work_area_id and status = 'ACTIVE'\n  for update;\n\n  if old_qr.id is null then raise exception 'Active QR not found'; end if;\n\n  update public.work_area_qr\n  set status = 'REVOKED', revoked_at = now(), version = version + 1\n  where id = old_qr.id;\n\n  new_token := app_private.new_public_qr_token();\n  insert into public.work_area_qr(\n    organization_id, site_id, work_area_id, public_token, status\n  ) values (\n    wa.organization_id, wa.site_id, wa.id, new_token, 'ACTIVE'\n  ) returning id into new_qr_id;\n\n  insert into public.operation_idempotency(\n    organization_id, operation_code, idempotency_key, result_json\n  ) values (\n    org_id, 'QR_REGENERATE', p_idempotency_key,\n    jsonb_build_object('qrId', new_qr_id, 'publicToken', new_token)\n  );\n\n  select display_name into actor_name from public.app_user\n  where id = app_private.current_user_id();\n\n  insert into public.audit_event(\n    organization_id, actor_user_id, actor_membership_id,\n    actor_display_name_snapshot, module_code, action_code,\n    entity_type, entity_id, old_value_json, new_value_json, source_channel\n  ) values (\n    org_id, app_private.current_user_id(), app_private.current_membership_id(),\n    actor_name, 'QR', 'QR_REGENERATED',\n    'WorkArea', wa.id::text,\n    jsonb_build_object('qrId', old_qr.id, 'status', 'ACTIVE'),\n    jsonb_build_object('qrId', new_qr_id, 'status', 'ACTIVE'),\n    'WEB'\n  );\n\n  return query select new_qr_id, new_token;\nend;\n$$;\n\nrevoke all on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) from public;\nrevoke all on function app_private.regenerate_work_area_qr(uuid,text) from public;\ngrant execute on function app_private.create_work_area_with_qr(uuid,text,text,text,text,text) to vnext_runtime;\ngrant execute on function app_private.regenerate_work_area_qr(uuid,text) to vnext_runtime;\n",
  "scripts/db-apply-work-area-qr-token-hotfix-05.mjs": 'import fs from "node:fs";\nimport postgres from "postgres";\n\nif (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");\n\nconst url = process.env.MIGRATION_DATABASE_URL;\nif (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");\n\nconst sql = postgres(url, { max: 1, prepare: false, ssl: "require" });\ntry {\n  await sql.unsafe(fs.readFileSync("drizzle/0005_work_area_qr_token_hotfix.sql", "utf8"));\n  const rows = await sql`\n    select\n      length(app_private.new_public_qr_token()) as token_length,\n      app_private.new_public_qr_token() ~ \'^[a-f0-9]{48}$\' as token_format_ok\n  `;\n  if (Number(rows[0].token_length) !== 48 || rows[0].token_format_ok !== true) {\n    throw new Error("QR token hotfix verification failed.");\n  }\n  console.log("Work Area + QR public token hotfix applied and verified.");\n} finally {\n  await sql.end({ timeout: 5 });\n}\n',
};
for (const [rel, content] of Object.entries(writes)) {
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, content, "utf8");
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts["db:work-area-qr:hotfix"] = "node scripts/db-apply-work-area-qr-token-hotfix-05.mjs";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n", "utf8");

execSync("node --check scripts/db-apply-work-area-qr-token-hotfix-05.mjs", { stdio: "inherit" });
console.log("Work Area + QR token hotfix files applied.");
console.log("Next: npm run db:work-area-qr:hotfix");
