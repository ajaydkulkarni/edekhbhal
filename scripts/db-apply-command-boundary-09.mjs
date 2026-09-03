import fs from "node:fs";
import postgres from "postgres";

function loadEnv(path=".env.local"){
  if(!fs.existsSync(path)) return;
  for(const raw of fs.readFileSync(path,"utf8").split(/\r?\n/)){
    const line=raw.trim();
    if(!line || line.startsWith("#")) continue;
    const i=line.indexOf("=");
    if(i<1) continue;
    const key=line.slice(0,i).trim();
    let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
    if(!(key in process.env)) process.env[key]=value;
  }
}
loadEnv();
const url=process.env.MIGRATION_DATABASE_URL;
if(!url) throw new Error("MIGRATION_DATABASE_URL is required.");
const sql=postgres(url,{max:1,prepare:false,ssl:"require"});
try{
  await sql.unsafe(fs.readFileSync("drizzle/0009_task_schedule_command_boundary_hardening.sql","utf8"));

  const p=await sql`
    select
      has_table_privilege('vnext_runtime','public.task_master','INSERT') task_insert,
      has_table_privilege('vnext_runtime','public.task_master','UPDATE') task_update,
      has_table_privilege('vnext_runtime','public.schedule_master','INSERT') schedule_insert,
      has_table_privilege('vnext_runtime','public.schedule_master','UPDATE') schedule_update,
      has_table_privilege('vnext_runtime','public.schedule_task','INSERT') schedule_task_insert,
      has_table_privilege('vnext_runtime','public.schedule_task','UPDATE') schedule_task_update,
      has_table_privilege('vnext_runtime','public.schedule_task','DELETE') schedule_task_delete,
      has_function_privilege(
        'vnext_runtime',
        'app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb)',
        'EXECUTE'
      ) helper_execute
  `;
  const bad=Object.entries(p[0]).filter(([,v])=>v===true);
  if(bad.length) throw new Error(`Runtime command-boundary privilege still present: ${bad.map(([k])=>k).join(", ")}`);

  const f=await sql`
    select p.proname,p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname in (
        'create_task_master','update_task_master','set_task_master_status',
        'create_schedule_master','update_schedule_master','set_schedule_master_status',
        'insert_schedule_tasks'
      )
  `;
  const missing=f.filter(r=>!r.prosecdef).map(r=>r.proname);
  if(missing.length) throw new Error(`Expected SECURITY DEFINER: ${missing.join(", ")}`);

  console.log("Task + Schedule Command Boundary Hardening 01 applied and verified.");
} finally {
  await sql.end({timeout:5});
}
