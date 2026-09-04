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
    "vnext_evidence_worker does not exist. Provision the NOLOGIN capability role before applying worker grants."
  );
  if(role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls||role.rolcanlogin){
    throw new Error("vnext_evidence_worker has unsafe role attributes; refusing to grant worker capabilities.");
  }

  await db.unsafe(`
    grant usage on schema app_private to vnext_evidence_worker;

    grant execute on function app_private.claim_evidence_worker_event(text,integer)
      to vnext_evidence_worker;
    grant execute on function app_private.fail_evidence_worker_event(uuid,uuid,text,text,integer)
      to vnext_evidence_worker;
    grant execute on function app_private.renew_evidence_worker_event_lease(uuid,uuid,text,integer)
      to vnext_evidence_worker;
    grant execute on function app_private.complete_evidence_worker_event_if_terminal(uuid,uuid,text)
      to vnext_evidence_worker;

    grant execute on function app_private.claim_evidence_processing_for_event(uuid,uuid,text,text)
      to vnext_evidence_worker;
    grant execute on function app_private.release_evidence_processing_lease_for_retry(uuid,bigint,uuid,text,text)
      to vnext_evidence_worker;
    grant execute on function app_private.renew_evidence_processing_lease(uuid,bigint,uuid,text,integer)
      to vnext_evidence_worker;
    grant execute on function app_private.get_evidence_processing_targets(uuid,bigint,uuid,text)
      to vnext_evidence_worker;
    grant execute on function app_private.complete_evidence_processing_transport(
      uuid,bigint,uuid,text,text,text,bigint,text,bigint,boolean,text,text
    ) to vnext_evidence_worker;
    grant execute on function app_private.reject_evidence_processing_observation(
      uuid,bigint,uuid,text,text,bigint,text,text,text
    ) to vnext_evidence_worker;

    grant execute on function app_private.mark_evidence_original_deleted_for_event(uuid,uuid,text,text)
      to vnext_evidence_worker;
    grant execute on function app_private.assert_evidence_worker_storage_principal(uuid,text)
      to vnext_evidence_worker;

    revoke execute on function app_private.complete_evidence_worker_event(uuid,uuid,text)
      from vnext_evidence_worker;
    revoke execute on function app_private.claim_evidence_processing(uuid,bigint,text,text)
      from vnext_evidence_worker;
    revoke execute on function app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)
      from vnext_evidence_worker;
    revoke execute on function app_private.complete_evidence_processing(
      uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text
    ) from vnext_evidence_worker;

    revoke execute on function app_private.authorize_occurrence_evidence_read(uuid,text)
      from vnext_evidence_worker;
    revoke execute on function app_private.audit_evidence_read_url_issued(uuid,text,text,text)
      from vnext_evidence_worker;
  `);

  const p=(await db`
    select
      has_schema_privilege('vnext_evidence_worker','app_private','USAGE') schema_usage,
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_worker_event(text,integer)','EXECUTE') q_claim,
      has_function_privilege('vnext_evidence_worker','app_private.fail_evidence_worker_event(uuid,uuid,text,text,integer)','EXECUTE') q_fail,
      has_function_privilege('vnext_evidence_worker','app_private.renew_evidence_worker_event_lease(uuid,uuid,text,integer)','EXECUTE') q_renew,
      has_function_privilege('vnext_evidence_worker','app_private.complete_evidence_worker_event_if_terminal(uuid,uuid,text)','EXECUTE') q_terminal,
      has_function_privilege('vnext_evidence_worker','app_private.complete_evidence_worker_event(uuid,uuid,text)','EXECUTE') q_free_complete,
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_processing_for_event(uuid,uuid,text,text)','EXECUTE') p_claim_event,
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_processing(uuid,bigint,text,text)','EXECUTE') p_legacy_claim,
      has_function_privilege('vnext_evidence_worker','app_private.release_evidence_processing_lease_for_retry(uuid,bigint,uuid,text,text)','EXECUTE') p_release,
      has_function_privilege('vnext_evidence_worker','app_private.renew_evidence_processing_lease(uuid,bigint,uuid,text,integer)','EXECUTE') p_renew,
      has_function_privilege('vnext_evidence_worker','app_private.get_evidence_processing_targets(uuid,bigint,uuid,text)','EXECUTE') targets,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.complete_evidence_processing_transport(uuid,bigint,uuid,text,text,text,bigint,text,bigint,boolean,text,text)',
        'EXECUTE'
      ) transport_complete,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.reject_evidence_processing_observation(uuid,bigint,uuid,text,text,bigint,text,text,text)',
        'EXECUTE'
      ) reject_observation,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.complete_evidence_processing(uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text)',
        'EXECUTE'
      ) legacy_complete,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.mark_evidence_original_deleted_for_event(uuid,uuid,text,text)',
        'EXECUTE'
      ) original_delete_event,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) free_original_delete,
      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.assert_evidence_worker_storage_principal(uuid,text)',
        'EXECUTE'
      ) principal_assert,
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

  if(!p.schema_usage||!p.q_claim||!p.q_fail||!p.q_renew||!p.q_terminal||
     !p.p_claim_event||!p.p_release||!p.p_renew||!p.targets||!p.transport_complete||
     !p.reject_observation||!p.original_delete_event||!p.principal_assert)
    throw new Error("Worker 03B2 capability function grants are incomplete.");
  if(p.q_free_complete||p.p_legacy_claim||p.free_original_delete||p.legacy_complete)
    throw new Error("Worker must not retain free-form event completion, stale-version processing claim, free-form original deletion, or legacy free-form Evidence completion.");
  if(p.app_read||p.app_read_audit)
    throw new Error("Worker role must not receive application Evidence-read capabilities.");

  const tablePrivs=await db`
    select table_schema,table_name,privilege_type
    from information_schema.role_table_grants
    where grantee='vnext_evidence_worker'
      and (
        (table_schema='public' and table_name in(
          'outbox_event','schedule_occurrence_evidence','schedule_occurrence',
          'schedule_occurrence_task','operation_idempotency','audit_event'
        ))
        or
        (table_schema='app_private' and table_name='evidence_worker_storage_principal')
      )
    order by table_schema,table_name,privilege_type
  `;
  if(tablePrivs.length!==0){
    throw new Error(`Worker role unexpectedly has direct sensitive-table privileges: ${JSON.stringify(tablePrivs)}`);
  }

  console.log("Evidence worker 03B2 capability grants applied and verified.");
  console.log("vnext_evidence_worker remains NOLOGIN and non-BYPASSRLS.");
  console.log("Processing claims are event-bound and queue acknowledgement is terminal-state-bound.");
  console.log("No direct sensitive-table grants, application Evidence-read capability, service-role secret, or S3 credential was introduced.");
}finally{
  await db.end({timeout:5});
}
