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
    ){
      value=value.slice(1,-1);
    }

    if(!(key in process.env)){
      process.env[key]=value;
    }
  }
}

loadEnv();

const url=process.env.MIGRATION_DATABASE_URL;

if(!url){
  throw new Error(
    "MIGRATION_DATABASE_URL is required."
  );
}

const db=postgres(url,{
  max:1,
  prepare:false,
  ssl:"require"
});

try{
  await db.unsafe(
    fs.readFileSync(
      "drizzle/0022_occurrence_generation_worker.sql",
      "utf8"
    )
  );

  console.log(
    "Occurrence generation worker migration 0022 executed."
  );


  const table=(await db`
    select
      to_regclass(
        'public.schedule_occurrence_generation_state'
      )::text as state_table
  `)[0];

  if(!table?.state_table){
    throw new Error(
      "Occurrence generation state table was not created."
    );
  }


  const rls=(await db`
    select
      relrowsecurity,
      relforcerowsecurity
    from pg_class
    where oid=
      'public.schedule_occurrence_generation_state'::regclass
  `)[0];

  if(
    !rls ||
    !rls.relrowsecurity ||
    !rls.relforcerowsecurity
  ){
    throw new Error(
      "Occurrence generation state table is not protected by FORCE RLS."
    );
  }


  const functions=(await db`
    select
      to_regprocedure(
        'app_private.reconcile_schedule_occurrences_additive_internal(uuid,timestamptz,timestamptz)'
      )::text as additive,

      to_regprocedure(
        'app_private.claim_occurrence_generation_schedule(text,integer)'
      )::text as claim,

      to_regprocedure(
        'app_private.complete_occurrence_generation_claim(uuid,uuid,text)'
      )::text as complete,

      to_regprocedure(
        'app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)'
      )::text as fail
  `)[0];

  if(
    !functions?.additive ||
    !functions?.claim ||
    !functions?.complete ||
    !functions?.fail
  ){
    throw new Error(
      "One or more occurrence generation worker functions are missing."
    );
  }


  const runtime=(await db`
    select
      has_table_privilege(
        'vnext_runtime',
        'public.schedule_occurrence_generation_state',
        'SELECT'
      ) as state_select,

      has_table_privilege(
        'vnext_runtime',
        'public.schedule_occurrence_generation_state',
        'INSERT'
      ) as state_insert,

      has_table_privilege(
        'vnext_runtime',
        'public.schedule_occurrence_generation_state',
        'UPDATE'
      ) as state_update,

      has_table_privilege(
        'vnext_runtime',
        'public.schedule_occurrence_generation_state',
        'DELETE'
      ) as state_delete,

      has_function_privilege(
        'vnext_runtime',
        'app_private.reconcile_schedule_occurrences_additive_internal(uuid,timestamptz,timestamptz)',
        'EXECUTE'
      ) as additive_execute,

      has_function_privilege(
        'vnext_runtime',
        'app_private.claim_occurrence_generation_schedule(text,integer)',
        'EXECUTE'
      ) as claim_execute,

      has_function_privilege(
        'vnext_runtime',
        'app_private.complete_occurrence_generation_claim(uuid,uuid,text)',
        'EXECUTE'
      ) as complete_execute,

      has_function_privilege(
        'vnext_runtime',
        'app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)',
        'EXECUTE'
      ) as fail_execute
  `)[0];

  if(
    runtime.state_select ||
    runtime.state_insert ||
    runtime.state_update ||
    runtime.state_delete ||
    runtime.additive_execute ||
    runtime.claim_execute ||
    runtime.complete_execute ||
    runtime.fail_execute
  ){
    throw new Error(
      "Normal application runtime received occurrence-worker capabilities."
    );
  }


  const publicAccess=(await db`
    select
      has_function_privilege(
        'authenticated',
        'app_private.claim_occurrence_generation_schedule(text,integer)',
        'EXECUTE'
      ) as authenticated_claim,

      has_function_privilege(
        'authenticated',
        'app_private.complete_occurrence_generation_claim(uuid,uuid,text)',
        'EXECUTE'
      ) as authenticated_complete,

      has_function_privilege(
        'authenticated',
        'app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)',
        'EXECUTE'
      ) as authenticated_fail
  `)[0];

  if(
    publicAccess.authenticated_claim ||
    publicAccess.authenticated_complete ||
    publicAccess.authenticated_fail
  ){
    throw new Error(
      "Authenticated clients unexpectedly received worker commands."
    );
  }


  const additiveDefinition=(await db`
    select pg_get_functiondef(
      'app_private.reconcile_schedule_occurrences_additive_internal(uuid,timestamptz,timestamptz)'::regprocedure
    ) as definition
  `)[0]?.definition;

  if(!additiveDefinition){
    throw new Error(
      "Unable to inspect additive reconciler."
    );
  }

  const additive=
    String(additiveDefinition);


  if(
    !/on conflict\s*\(\s*schedule_id\s*,\s*scheduled_start_utc\s*\)\s*do nothing/i
      .test(additive)
  ){
    throw new Error(
      "Additive reconciler does not preserve existing Occurrences."
    );
  }


  const prohibited=[
    /delete\s+from\s+public\.schedule_occurrence\b/i,
    /delete\s+from\s+public\.schedule_occurrence_task\b/i,
    /update\s+public\.schedule_occurrence\b/i,
    /update\s+public\.schedule_occurrence_task\b/i
  ];

  if(prohibited.some(pattern=>pattern.test(additive))){
    throw new Error(
      "Additive reconciler contains destructive existing-Occurrence DML."
    );
  }


  if(
    !/org_row\.status\s*<>\s*'ACTIVE'/i
      .test(additive)
  ){
    throw new Error(
      "Additive reconciler does not fail closed for an inactive Organization."
    );
  }


  console.log(
    "Generation-state FORCE RLS: PASS"
  );

  console.log(
    "Normal runtime worker capabilities: DENIED"
  );

  console.log(
    "Authenticated worker commands: DENIED"
  );

  console.log(
    "Additive existing-Occurrence preservation: PASS"
  );

  console.log(
    "Organization ACTIVE boundary: PASS"
  );

  console.log();
  console.log(
    "Occurrence Generation Worker Foundation 04A migration 0022 applied and verified."
  );

}finally{
  await db.end({timeout:5});
}
