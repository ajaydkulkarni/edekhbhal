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
  await db.unsafe(fs.readFileSync("drizzle/0020_evidence_worker_media_execution_hardening.sql","utf8"));

  const funcs=await db`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname in(
        'claim_evidence_processing_for_event',
        'release_evidence_processing_lease_for_retry',
        'reject_evidence_processing_observation',
        'complete_evidence_worker_event_if_terminal',
        'mark_evidence_original_deleted_for_event'
      )
    order by p.proname
  `;
  if(funcs.length!==5)throw new Error(`0020 expected 5 worker-media hardening functions, found ${funcs.length}.`);

  const runtime=(await db`
    select
      has_function_privilege(
        'vnext_runtime',
        'app_private.claim_evidence_processing_for_event(uuid,uuid,text,text)',
        'EXECUTE'
      ) claim_event,
      has_function_privilege(
        'vnext_runtime',
        'app_private.release_evidence_processing_lease_for_retry(uuid,bigint,uuid,text,text)',
        'EXECUTE'
      ) release_retry,
      has_function_privilege(
        'vnext_runtime',
        'app_private.reject_evidence_processing_observation(uuid,bigint,uuid,text,text,bigint,text,text,text)',
        'EXECUTE'
      ) reject_observation,
      has_function_privilege(
        'vnext_runtime',
        'app_private.complete_evidence_worker_event_if_terminal(uuid,uuid,text)',
        'EXECUTE'
      ) terminal_complete,
      has_function_privilege(
        'vnext_runtime',
        'app_private.mark_evidence_original_deleted_for_event(uuid,uuid,text,text)',
        'EXECUTE'
      ) delete_for_event
  `)[0];
  if(runtime.claim_event||runtime.release_retry||runtime.reject_observation||runtime.terminal_complete||runtime.delete_for_event)
    throw new Error("Normal runtime must not execute 03B2 worker-media commands.");

  const worker=(await db`
    select
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.claim_evidence_processing(uuid,bigint,text,text)',
        'EXECUTE'
      ) legacy_claim,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.complete_evidence_worker_event(uuid,uuid,text)',
        'EXECUTE'
      ) free_event_complete,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) free_original_delete
  `)[0];
  if(worker.legacy_claim||worker.free_event_complete||worker.free_original_delete)
    throw new Error("0020 must revoke legacy free-form worker claim/event-completion/deletion capabilities before re-grant.");

  console.log("Evidence Worker Real Media Processing Foundation 03B2 database hardening applied and verified.");
  console.log("Migration 0020 replaces stale-version processing claims with live event-bound claims.");
  console.log("Free-form worker event completion is revoked; terminal-aware acknowledgement is now required.");
  console.log("Run the updated worker-role grant step next. No Storage policy or credential change is required.");
}finally{
  await db.end({timeout:5});
}
