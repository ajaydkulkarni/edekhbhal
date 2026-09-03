import fs from "node:fs";
import postgres from "postgres";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  await sql.unsafe(fs.readFileSync("drizzle/0006_work_area_qr_hardening.sql", "utf8"));

  const checks = await sql`
    select
      to_regprocedure('app_private.has_site_scope(uuid)') is not null as has_site_scope,
      to_regprocedure('app_private.has_active_site_access(uuid)') is not null as has_active_site_access,
      to_regprocedure('app_private.create_work_area_with_qr(uuid,text,text,text,text,text)') is not null as has_create,
      to_regprocedure('app_private.regenerate_work_area_qr(uuid,text)') is not null as has_regenerate
  `;

  if (!Object.values(checks[0]).every(Boolean)) {
    throw new Error("Work Area + QR hardening verification failed.");
  }

  const policies = await sql`
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('site','work_area','work_area_qr','operation_idempotency')
  `;
  const names = new Set(policies.map((r) => r.policyname));
  for (const required of [
    "site_select",
    "site_insert",
    "site_update",
    "work_area_select",
    "work_area_insert",
    "work_area_update",
    "work_area_qr_select",
    "operation_idempotency_select",
    "operation_idempotency_insert",
  ]) {
    if (!names.has(required)) throw new Error(`Missing expected RLS policy: ${required}`);
  }

  console.log("Work Area + QR Hardening 02 applied and verified.");
} finally {
  await sql.end({ timeout: 5 });
}
