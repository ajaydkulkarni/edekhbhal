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
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(!(key in process.env))process.env[key]=value;
  }
}
loadEnv();
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("MIGRATION_DATABASE_URL is required.");

const db=postgres(url,{max:1,prepare:false,ssl:"require"});
try{
  await db.unsafe(fs.readFileSync("drizzle/0018_evidence_worker_authorized_reads.sql","utf8"));

  const cols=await db`
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name='outbox_event'
      and column_name in('worker_claim_token','worker_id','worker_lease_until','last_attempt_at')
  `;
  if(cols.length!==4)throw new Error(`0018 expected 4 outbox worker columns, found ${cols.length}.`);

  const funcs=await db`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname in(
        'claim_evidence_worker_event','complete_evidence_worker_event','fail_evidence_worker_event',
        'mark_evidence_original_deleted','authorize_occurrence_evidence_read','audit_evidence_read_url_issued'
      )
  `;
  if(funcs.length!==6)throw new Error(`0018 expected 6 command functions, found ${funcs.length}.`);

  const priv=(await db`
    select
      has_function_privilege('vnext_runtime','app_private.claim_evidence_worker_event(text,integer)','EXECUTE') worker_claim,
      has_function_privilege('vnext_runtime','app_private.complete_evidence_worker_event(uuid,uuid,text)','EXECUTE') worker_complete,
      has_function_privilege('vnext_runtime','app_private.fail_evidence_worker_event(uuid,uuid,text,text,integer)','EXECUTE') worker_fail,
      has_function_privilege('vnext_runtime','app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)','EXECUTE') worker_delete,
      has_function_privilege('vnext_runtime','app_private.authorize_occurrence_evidence_read(uuid,text)','EXECUTE') read_auth,
      has_function_privilege('vnext_runtime','app_private.audit_evidence_read_url_issued(uuid,text,text,text)','EXECUTE') read_audit
  `)[0];

  if(priv.worker_claim||priv.worker_complete||priv.worker_fail||priv.worker_delete)
    throw new Error("Normal runtime must not execute worker commands.");
  if(!priv.read_auth||!priv.read_audit)
    throw new Error("Normal runtime Evidence read authorization/audit grants are incomplete.");

  console.log("Evidence Worker Queue & Authorized Reads Foundation 03A applied and verified.");
  console.log("Worker capability role is intentionally a separate privileged setup.");
  console.log("No LOGIN worker secret and no universal service-role credential were introduced.");
}finally{
  await db.end({timeout:5});
}
