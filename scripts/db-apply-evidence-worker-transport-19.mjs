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
  await db.unsafe(fs.readFileSync("drizzle/0019_evidence_worker_transport_foundation.sql","utf8"));

  const table=(await db`
    select to_regclass('app_private.evidence_worker_storage_principal')::text as name
  `)[0]?.name;
  if(table!=="app_private.evidence_worker_storage_principal")
    throw new Error("0019 worker Storage principal table was not created.");

  const funcs=await db`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='app_private' and p.proname in(
      'assert_evidence_worker_storage_principal',
      'renew_evidence_worker_event_lease',
      'renew_evidence_processing_lease',
      'get_evidence_processing_targets',
      'complete_evidence_processing_transport'
    ))
    or (n.nspname='public' and p.proname in(
      'storage_worker_can_read_occurrence_evidence',
      'storage_worker_can_write_occurrence_evidence',
      'storage_worker_can_delete_occurrence_evidence'
    ))
  `;
  if(funcs.length!==8)throw new Error(`0019 expected 8 transport/helper functions, found ${funcs.length}.`);

  const runtime=(await db`
    select
      has_function_privilege('vnext_runtime','app_private.renew_evidence_worker_event_lease(uuid,uuid,text,integer)','EXECUTE') event_renew,
      has_function_privilege('vnext_runtime','app_private.renew_evidence_processing_lease(uuid,bigint,uuid,text,integer)','EXECUTE') processing_renew,
      has_function_privilege('vnext_runtime','app_private.get_evidence_processing_targets(uuid,bigint,uuid,text)','EXECUTE') targets,
      has_function_privilege(
        'vnext_runtime',
        'app_private.complete_evidence_processing_transport(uuid,bigint,uuid,text,text,text,bigint,text,bigint,boolean,text,text)',
        'EXECUTE'
      ) transport_complete
  `)[0];
  if(runtime.event_renew||runtime.processing_renew||runtime.targets||runtime.transport_complete)
    throw new Error("Normal runtime must not execute 03B1 worker transport commands.");

  const auth=(await db`
    select
      has_function_privilege('authenticated','public.storage_worker_can_read_occurrence_evidence(text,text,text)','EXECUTE') worker_read,
      has_function_privilege('authenticated','public.storage_worker_can_write_occurrence_evidence(text,text,text)','EXECUTE') worker_write,
      has_function_privilege('authenticated','public.storage_worker_can_delete_occurrence_evidence(text,text,text)','EXECUTE') worker_delete
  `)[0];
  if(!auth.worker_read||!auth.worker_write||!auth.worker_delete)
    throw new Error("Authenticated Storage helper EXECUTE grants are incomplete.");

  const runtimePrincipal=await db`
    select privilege_type
    from information_schema.role_table_grants
    where grantee='vnext_runtime'
      and table_schema='app_private'
      and table_name='evidence_worker_storage_principal'
  `;
  if(runtimePrincipal.length!==0)
    throw new Error("vnext_runtime must not have direct worker Storage principal table privileges.");

  console.log("Evidence Worker Transport & Storage Authorization Foundation 03B1 applied and verified.");
  console.log("Migration 0019 changed the worker capability contract; run the updated worker-role grant step next.");
  console.log("Supabase Storage worker policies remain a separate privileged setup and are NOT applied by this script.");
  console.log("No LOGIN password, service-role/secret API key, or S3 credential was created.");
}finally{
  await db.end({timeout:5});
}
