import fs from "node:fs";
import postgres from "postgres";

function loadEnv(path=".env.local"){
  if(!fs.existsSync(path)) return;
  for(const raw of fs.readFileSync(path,"utf8").split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith("#")) continue;
    const i=line.indexOf("="); if(i<1) continue;
    const key=line.slice(0,i).trim(); let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
    if(!(key in process.env)) process.env[key]=value;
  }
}
loadEnv();

const url=process.env.MIGRATION_DATABASE_URL;
if(!url) throw new Error("MIGRATION_DATABASE_URL is required.");
const sql=postgres(url,{max:1,prepare:false,ssl:"require"});

try{
  await sql.unsafe(fs.readFileSync("drizzle/0010_occurrence_foundation.sql","utf8"));

  const tables=await sql`
    select to_regclass('public.schedule_occurrence') occurrence,
           to_regclass('public.schedule_occurrence_task') occurrence_task
  `;
  if(!tables[0].occurrence||!tables[0].occurrence_task) throw new Error("Occurrence tables were not created.");

  const privileges=await sql`
    select
      has_table_privilege('vnext_runtime','public.schedule_occurrence','SELECT') occurrence_select,
      has_table_privilege('vnext_runtime','public.schedule_occurrence','INSERT') occurrence_insert,
      has_table_privilege('vnext_runtime','public.schedule_occurrence','UPDATE') occurrence_update,
      has_table_privilege('vnext_runtime','public.schedule_occurrence','DELETE') occurrence_delete,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_task','SELECT') task_select,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_task','INSERT') task_insert,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_task','UPDATE') task_update,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_task','DELETE') task_delete,
      has_function_privilege(
        'vnext_runtime',
        'app_private.reconcile_schedule_occurrences(uuid,timestamptz,timestamptz)',
        'EXECUTE'
      ) reconcile_execute,
      has_function_privilege(
        'vnext_runtime',
        'app_private.reconcile_schedule_occurrences_internal(uuid,timestamptz,timestamptz)',
        'EXECUTE'
      ) internal_execute
  `;
  const p=privileges[0];
  if(!p.occurrence_select||!p.task_select||!p.reconcile_execute) throw new Error("Required occurrence read/command grants are missing.");
  if(p.occurrence_insert||p.occurrence_update||p.occurrence_delete||p.task_insert||p.task_update||p.task_delete||p.internal_execute)
    throw new Error("Runtime occurrence command boundary is too broad.");

  const rls=await sql`
    select relname,relrowsecurity,relforcerowsecurity
    from pg_class
    where relname in ('schedule_occurrence','schedule_occurrence_task')
    order by relname
  `;
  if(rls.length!==2||rls.some(r=>!r.relrowsecurity||!r.relforcerowsecurity))
    throw new Error("Occurrence RLS/FORCE RLS verification failed.");

  const fk=await sql`
    select 1 ok from pg_constraint
    where conname='task_attachment_org_task_fk'
  `;
  if(!fk.length) throw new Error("Task attachment composite tenant FK is missing.");

  console.log("Occurrence Foundation 01 migration applied and verified.");
} finally {
  await sql.end({timeout:5});
}
