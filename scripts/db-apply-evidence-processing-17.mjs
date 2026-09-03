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
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))){
      value=value.slice(1,-1);
    }
    if(!(key in process.env))process.env[key]=value;
  }
}
loadEnv();
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("MIGRATION_DATABASE_URL is required.");

const db=postgres(url,{max:1,prepare:false,ssl:"require"});
try{
  await db.unsafe(fs.readFileSync("drizzle/0017_evidence_processing_foundation.sql","utf8"));

  const cols=await db`
    select column_name
    from information_schema.columns
    where table_schema='public'
      and table_name='schedule_occurrence_evidence'
      and column_name in(
        'processing_status','processing_requested_at','processing_started_at',
        'processing_completed_at','processing_lease_until','processing_claim_token',
        'processor_id','processing_attempt_count','processing_error',
        'normalized_content_type','normalized_byte_size','original_disposition'
      )
  `;
  if(cols.length!==12)throw new Error(`0017 expected 12 processing columns, found ${cols.length}.`);

  const funcs=await db`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname in('claim_evidence_processing','complete_evidence_processing')
  `;
  if(funcs.length!==2)throw new Error(`0017 expected 2 processor functions, found ${funcs.length}.`);

  const priv=(await db`
    select
      has_function_privilege(
        'vnext_runtime',
        'app_private.claim_evidence_processing(uuid,bigint,text,text)',
        'EXECUTE'
      ) claim_exec,
      has_function_privilege(
        'vnext_runtime',
        'app_private.complete_evidence_processing(uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text)',
        'EXECUTE'
      ) complete_exec,
      has_function_privilege(
        'vnext_runtime',
        'app_private.finalize_evidence_upload(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) finalize_exec
  `)[0];

  if(priv.claim_exec||priv.complete_exec)throw new Error("Runtime must not execute processor commands.");
  if(!priv.finalize_exec)throw new Error("Runtime upload finalization grant is missing.");

  console.log("Evidence Verification & Media Normalization Foundation 02 applied and verified.");
  console.log("Processor command functions are intentionally ungranted until a dedicated worker identity is provisioned.");
}finally{
  await db.end({timeout:5});
}
