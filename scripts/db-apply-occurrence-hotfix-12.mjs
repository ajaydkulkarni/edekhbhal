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
  await sql.unsafe(fs.readFileSync("drizzle/0012_working_hours_validator_privilege_hotfix.sql","utf8"));

  const rows=await sql`
    select
      has_function_privilege(
        'vnext_runtime',
        'app_private.is_valid_working_hours_json(jsonb)',
        'EXECUTE'
      ) runtime_execute,
      has_function_privilege(
        'public',
        'app_private.is_valid_working_hours_json(jsonb)',
        'EXECUTE'
      ) public_execute
  `;
  if(!rows[0].runtime_execute) throw new Error("vnext_runtime cannot execute working-hours validator.");
  if(rows[0].public_execute) throw new Error("Working-hours validator is executable by PUBLIC.");

  console.log("Working-hours validator privilege hotfix 0012 applied and verified.");
} finally {
  await sql.end({timeout:5});
}
