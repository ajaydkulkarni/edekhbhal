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
  await sql.unsafe(fs.readFileSync("drizzle/0011_occurrence_id_ambiguity_hotfix.sql","utf8"));
  const rows=await sql`
    select pg_get_functiondef(
      'app_private.reconcile_schedule_occurrences_internal(uuid,timestamptz,timestamptz)'::regprocedure
    ) definition
  `;
  const definition=rows[0].definition;
  if(!definition.includes("v_occurrence_id")) throw new Error("Corrected occurrence variable was not installed.");
  if(/occurrence_id\s*=\s*occurrence_id/i.test(definition)) throw new Error("Ambiguous occurrence_id self-comparison remains installed.");
  if(!definition.includes("public.schedule_occurrence_task.occurrence_id=v_occurrence_id"))
    throw new Error("Qualified child occurrence predicate is missing.");
  console.log("Occurrence ambiguity hotfix 0011 applied and verified.");
} finally {
  await sql.end({timeout:5});
}
