import fs from "node:fs";
import postgres from "postgres";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  await sql.unsafe(fs.readFileSync("drizzle/0007_task_master_foundation.sql", "utf8"));

  const rows = await sql`
    select
      to_regclass('public.task_master') is not null as task_table,
      to_regclass('public.task_attachment') is not null as attachment_table,
      to_regprocedure('app_private.can_manage_tasks()') is not null as manage_helper,
      to_regprocedure('app_private.create_task_master(text,text,text)') is not null as create_fn,
      to_regprocedure('app_private.update_task_master(uuid,text,text,bigint)') is not null as update_fn,
      to_regprocedure('app_private.set_task_master_status(uuid,record_status,bigint)') is not null as status_fn
  `;

  if (!Object.values(rows[0]).every(Boolean)) {
    throw new Error("Task Master Foundation verification failed.");
  }

  const rls = await sql`
    select relname, relrowsecurity, relforcerowsecurity
    from pg_class
    where oid in ('public.task_master'::regclass, 'public.task_attachment'::regclass)
  `;
  if (rls.length !== 2 || rls.some((r) => !r.relrowsecurity || !r.relforcerowsecurity)) {
    throw new Error("Task Master RLS/FORCE RLS verification failed.");
  }

  console.log("Task Master Foundation 01 applied and verified.");
} finally {
  await sql.end({ timeout: 5 });
}
