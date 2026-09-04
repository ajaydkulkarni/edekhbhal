import fs from "node:fs";
import postgres from "postgres";

function loadEnv(path=".env.local"){
  if(!fs.existsSync(path))return;
  for(const raw of fs.readFileSync(path,"utf8").split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith("#"))continue;
    const i=line.indexOf("=");
    if(i<1)continue;
    const key=line.slice(0,i).trim();
    let value=line.slice(i+1).trim();
    if(
      (value.startsWith('"')&&value.endsWith('"'))||
      (value.startsWith("'")&&value.endsWith("'"))
    )value=value.slice(1,-1);
    if(!(key in process.env))process.env[key]=value;
  }
}

loadEnv();

const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("MIGRATION_DATABASE_URL is required.");

const db=postgres(url,{max:1,prepare:false,ssl:"require"});

try{
  await db.unsafe(
    fs.readFileSync(
      "drizzle/0021_evidence_storage_delete_confirmation_hardening.sql",
      "utf8"
    )
  );

  const grants=(await db`
    select
      has_function_privilege(
        'authenticated',
        'public.storage_can_read_occurrence_evidence(text,text,text)',
        'EXECUTE'
      ) as human_read,
      has_function_privilege(
        'authenticated',
        'public.storage_worker_can_read_occurrence_evidence(text,text,text)',
        'EXECUTE'
      ) as worker_read,
      has_function_privilege(
        'vnext_runtime',
        'public.storage_worker_can_read_occurrence_evidence(text,text,text)',
        'EXECUTE'
      ) as runtime_worker_read
  `)[0];

  if(!grants.human_read||!grants.worker_read||grants.runtime_worker_read)
    throw new Error("0021 helper privilege verification failed.");

  console.log(
    "Evidence Storage deletion-confirmation hardening 0021 applied and verified."
  );
}finally{
  await db.end({timeout:5});
}
