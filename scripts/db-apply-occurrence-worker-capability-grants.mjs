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

    let value=
      line.slice(i+1).trim();

    if(
      (
        value.startsWith('"') &&
        value.endsWith('"')
      ) ||
      (
        value.startsWith("'") &&
        value.endsWith("'")
      )
    ){
      value=value.slice(1,-1);
    }

    if(!(key in process.env)){
      process.env[key]=value;
    }
  }
}

loadEnv();

const url=
  process.env.MIGRATION_DATABASE_URL;

if(!url){
  throw new Error(
    "MIGRATION_DATABASE_URL is required."
  );
}

const db=postgres(
  url,
  {
    max:1,
    prepare:false,
    ssl:"require"
  }
);

try{

  console.log(
    "===== OCCURRENCE WORKER CAPABILITY ROLE ====="
  );


  const role=(await db`
    select
      rolname,
      rolsuper,
      rolcreatedb,
      rolcreaterole,
      rolreplication,
      rolbypassrls,
      rolcanlogin
    from pg_roles
    where rolname='vnext_occurrence_worker'
  `)[0];


  if(!role){
    throw new Error(
      "vnext_occurrence_worker does not exist. Provision the NOLOGIN capability role before applying grants."
    );
  }


  if(
    role.rolsuper ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolbypassrls ||
    role.rolcanlogin
  ){
    throw new Error(
      "vnext_occurrence_worker has unsafe role attributes; refusing to grant worker capabilities."
    );
  }


  console.log(
    "NOLOGIN/non-BYPASSRLS role attributes: PASS"
  );


  console.log();
  console.log(
    "===== APPLY EXACT CAPABILITY GRANTS ====="
  );


  await db.unsafe(`
    grant usage
      on schema app_private
      to vnext_occurrence_worker;


    grant execute
      on function
        app_private.claim_occurrence_generation_schedule(
          text,
          integer
        )
      to vnext_occurrence_worker;


    grant execute
      on function
        app_private.complete_occurrence_generation_claim(
          uuid,
          uuid,
          text
        )
      to vnext_occurrence_worker;


    grant execute
      on function
        app_private.fail_occurrence_generation_claim(
          uuid,
          uuid,
          text,
          text,
          integer
        )
      to vnext_occurrence_worker;


    revoke execute
      on function
        app_private.reconcile_schedule_occurrences_additive_internal(
          uuid,
          timestamptz,
          timestamptz
        )
      from vnext_occurrence_worker;


    revoke execute
      on function
        app_private.reconcile_schedule_occurrences(
          uuid,
          timestamptz,
          timestamptz
        )
      from vnext_occurrence_worker;
  `);


  console.log(
    "Exact worker function grants executed."
  );


  console.log();
  console.log(
    "===== VERIFY FUNCTION CAPABILITIES ====="
  );


  const capabilities=(await db`
    select

      has_schema_privilege(
        'vnext_occurrence_worker',
        'app_private',
        'USAGE'
      ) as schema_usage,


      has_function_privilege(
        'vnext_occurrence_worker',
        'app_private.claim_occurrence_generation_schedule(text,integer)',
        'EXECUTE'
      ) as claim_execute,


      has_function_privilege(
        'vnext_occurrence_worker',
        'app_private.complete_occurrence_generation_claim(uuid,uuid,text)',
        'EXECUTE'
      ) as complete_execute,


      has_function_privilege(
        'vnext_occurrence_worker',
        'app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)',
        'EXECUTE'
      ) as fail_execute,


      has_function_privilege(
        'vnext_occurrence_worker',
        'app_private.reconcile_schedule_occurrences_additive_internal(uuid,timestamptz,timestamptz)',
        'EXECUTE'
      ) as additive_execute,


      has_function_privilege(
        'vnext_occurrence_worker',
        'app_private.reconcile_schedule_occurrences(uuid,timestamptz,timestamptz)',
        'EXECUTE'
      ) as application_reconcile_execute,


      pg_has_role(
        'vnext_occurrence_worker',
        'vnext_runtime',
        'member'
      ) as runtime_member,


      pg_has_role(
        'vnext_occurrence_worker',
        'vnext_evidence_worker',
        'member'
      ) as evidence_worker_member
  `)[0];


  console.log(
    JSON.stringify(
      capabilities,
      null,
      2
    )
  );


  if(
    !capabilities.schema_usage ||
    !capabilities.claim_execute ||
    !capabilities.complete_execute ||
    !capabilities.fail_execute
  ){
    throw new Error(
      "Occurrence worker required capabilities are incomplete."
    );
  }


  if(
    capabilities.additive_execute ||
    capabilities.application_reconcile_execute ||
    capabilities.runtime_member ||
    capabilities.evidence_worker_member
  ){
    throw new Error(
      "Occurrence worker received an unauthorized capability or role membership."
    );
  }


  console.log(
    "Exact worker command boundary: PASS"
  );


  console.log();
  console.log(
    "===== VERIFY NO DIRECT TABLE PRIVILEGES ====="
  );


  const tablePrivileges=await db`
    select
      table_schema,
      table_name,
      privilege_type
    from information_schema.role_table_grants
    where grantee='vnext_occurrence_worker'
      and (
        (
          table_schema='public'
          and table_name in(
            'organization',
            'site',
            'work_area',
            'schedule_master',
            'schedule_task',
            'schedule_occurrence',
            'schedule_occurrence_task',
            'schedule_occurrence_generation_state',
            'audit_event',
            'outbox_event'
          )
        )
      )
    order by
      table_schema,
      table_name,
      privilege_type
  `;


  if(tablePrivileges.length!==0){
    throw new Error(
      `Occurrence worker unexpectedly has direct table privileges: ${JSON.stringify(tablePrivileges)}`
    );
  }


  console.log(
    "Direct sensitive-table privileges: NONE"
  );


  console.log();
  console.log(
    "Occurrence worker 04A capability grants applied and verified."
  );

  console.log(
    "vnext_occurrence_worker remains NOLOGIN and non-BYPASSRLS."
  );

  console.log(
    "Worker can claim, complete, or fail only the leased rolling-generation command boundary."
  );

}finally{

  await db.end({
    timeout:5
  });

}
