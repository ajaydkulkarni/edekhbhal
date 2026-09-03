import fs from "node:fs";
import postgres from "postgres";

function loadEnv(path=".env.local"){
  if(!fs.existsSync(path))return;
  for(const raw of fs.readFileSync(path,"utf8").split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith("#"))continue;
    const i=line.indexOf("=");if(i<1)continue;
    const key=line.slice(0,i).trim();let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(!(key in process.env))process.env[key]=value;
  }
}
loadEnv();
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("MIGRATION_DATABASE_URL is required.");
const sql=postgres(url,{max:1,prepare:false,ssl:"require"});
try{
  await sql.unsafe(fs.readFileSync("drizzle/0014_occurrence_task_execution_completion.sql","utf8"));

  const p=(await sql`
    select
      has_table_privilege('vnext_runtime','public.schedule_occurrence','UPDATE') occurrence_update,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_task','UPDATE') task_update,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_evidence','INSERT') evidence_insert,
      has_function_privilege('vnext_runtime','app_private.complete_occurrence_task(uuid,bigint,text,text,text)','EXECUTE') task_complete_execute,
      has_function_privilege('vnext_runtime','app_private.partially_complete_occurrence(uuid,bigint,text,text,text)','EXECUTE') partial_execute,
      has_function_privilege('vnext_runtime','app_private.audit_occurrence_task_event(text,uuid,uuid,jsonb,jsonb,text,text)','EXECUTE') task_audit_execute
  `)[0];

  if(p.occurrence_update||p.task_update)throw new Error("Runtime direct Occurrence DML must remain revoked.");
  if(p.evidence_insert)throw new Error("Runtime direct evidence INSERT must remain revoked.");
  if(!p.task_complete_execute||!p.partial_execute)throw new Error("Task execution command grants are incomplete.");
  if(p.task_audit_execute)throw new Error("Internal Task audit helper must not be runtime executable.");

  const columns=await sql`
    select table_name,column_name
    from information_schema.columns
    where table_schema='public'
      and (
        (table_name='schedule_occurrence_task' and column_name in ('actual_duration_seconds','execution_notes','canceled_at','cancel_reason'))
        or
        (table_name='schedule_occurrence' and column_name in ('actual_duration_seconds','completion_reason'))
      )
  `;
  if(columns.length!==6)throw new Error("Occurrence execution columns are incomplete.");

  const evidence=await sql`
    select relrowsecurity rls,relforcerowsecurity force_rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='schedule_occurrence_evidence'
  `;
  if(!evidence.length||!evidence[0].rls||!evidence[0].force_rls)throw new Error("Evidence metadata RLS/FORCE RLS is incomplete.");

  console.log("Occurrence Task Execution & Completion Foundation 01 applied and verified.");
}finally{await sql.end({timeout:5});}
