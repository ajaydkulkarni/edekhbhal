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
  const role=(await db`
    select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin
    from pg_roles where rolname='vnext_evidence_worker'
  `)[0];
  if(!role)throw new Error(
    "vnext_evidence_worker does not exist. Run supabase-privileged/002_evidence_worker_capability_role.sql in the Supabase SQL Editor first."
  );
  if(role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls||role.rolcanlogin){
    throw new Error("vnext_evidence_worker has unsafe role attributes; refusing to grant worker capabilities.");
  }

  // vnext_migrator owns app_private and these functions. This avoids asking the
  // Supabase project `postgres` role to grant privileges on objects it does not own.
  await db.unsafe(`
    grant usage on schema app_private to vnext_evidence_worker;

    grant execute on function app_private.claim_evidence_worker_event(text,integer)
      to vnext_evidence_worker;
    grant execute on function app_private.complete_evidence_worker_event(uuid,uuid,text)
      to vnext_evidence_worker;
    grant execute on function app_private.fail_evidence_worker_event(uuid,uuid,text,text,integer)
      to vnext_evidence_worker;
    grant execute on function app_private.claim_evidence_processing(uuid,bigint,text,text)
      to vnext_evidence_worker;
    grant execute on function app_private.complete_evidence_processing(
      uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text
    ) to vnext_evidence_worker;
    grant execute on function app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)
      to vnext_evidence_worker;

    revoke execute on function app_private.authorize_occurrence_evidence_read(uuid,text)
      from vnext_evidence_worker;
    revoke execute on function app_private.audit_evidence_read_url_issued(uuid,text,text,text)
      from vnext_evidence_worker;
  `);

  const p=(await db`
    select
      has_schema_privilege('vnext_evidence_worker','app_private','USAGE') schema_usage,
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_worker_event(text,integer)','EXECUTE') q_claim,
      has_function_privilege('vnext_evidence_worker','app_private.complete_evidence_worker_event(uuid,uuid,text)','EXECUTE') q_complete,
      has_function_privilege('vnext_evidence_worker','app_private.fail_evidence_worker_event(uuid,uuid,text,text,integer)','EXECUTE') q_fail,
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_processing(uuid,bigint,text,text)','EXECUTE') p_claim,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.complete_evidence_processing(uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text)',
        'EXECUTE'
      ) p_complete,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) original_delete,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.authorize_occurrence_evidence_read(uuid,text)',
        'EXECUTE'
      ) app_read,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.audit_evidence_read_url_issued(uuid,text,text,text)',
        'EXECUTE'
      ) app_read_audit
  `)[0];

  if(!p.schema_usage||!p.q_claim||!p.q_complete||!p.q_fail||!p.p_claim||!p.p_complete||!p.original_delete)
    throw new Error("Worker capability function grants are incomplete.");
  if(p.app_read||p.app_read_audit)
    throw new Error("Worker role must not receive application Evidence-read capabilities.");

  const tablePrivs=await db`
    select table_name,privilege_type
    from information_schema.role_table_grants
    where grantee='vnext_evidence_worker'
      and table_schema='public'
      and table_name in(
        'outbox_event','schedule_occurrence_evidence','schedule_occurrence',
        'schedule_occurrence_task','operation_idempotency','audit_event'
      )
    order by table_name,privilege_type
  `;
  if(tablePrivs.length!==0){
    throw new Error(`Worker role unexpectedly has direct public-table privileges: ${JSON.stringify(tablePrivs)}`);
  }

  console.log("Evidence worker capability grants applied and verified.");
  console.log("vnext_evidence_worker remains NOLOGIN and non-BYPASSRLS.");
  console.log("Worker has app_private USAGE + exact command EXECUTE only; no direct sensitive-table grants.");
  console.log("No worker password or service-role secret was created.");
}finally{
  await db.end({timeout:5});
}
