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
  await sql.unsafe(fs.readFileSync("drizzle/0013_occurrence_execution_supersession.sql","utf8"));

  const p=(await sql`
    select
      has_table_privilege('vnext_runtime','public.schedule_occurrence','UPDATE') occurrence_update,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_task','UPDATE') task_update,
      has_function_privilege('vnext_runtime','app_private.apply_due_supersession(text)','EXECUTE') supersession_execute,
      has_function_privilege('vnext_runtime','app_private.claim_occurrence(uuid,text,text)','EXECUTE') claim_execute,
      has_function_privilege('vnext_runtime','app_private.start_occurrence_with_qr(uuid,text,text,text)','EXECUTE') start_execute,
      has_function_privilege('vnext_runtime','app_private.supersede_older_due_occurrences_internal(uuid,timestamptz,text)','EXECUTE') internal_execute
  `)[0];

  if(p.occurrence_update||p.task_update)throw new Error("Runtime direct Occurrence UPDATE must remain revoked.");
  if(!p.supersession_execute||!p.claim_execute||!p.start_execute)throw new Error("Execution command grants are incomplete.");
  if(p.internal_execute)throw new Error("Internal supersession helper must not be runtime executable.");

  const idx=await sql`
    select 1 ok
    from pg_indexes
    where schemaname='public' and indexname='schedule_occurrence_one_active_membership_uq'
  `;
  if(!idx.length)throw new Error("Active-work exclusivity index is missing.");

  console.log("Occurrence Execution & Supersession Foundation 01 applied and verified.");
}finally{await sql.end({timeout:5});}
