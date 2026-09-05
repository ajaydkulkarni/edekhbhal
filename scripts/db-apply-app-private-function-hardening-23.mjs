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
      (value.startsWith('"')&&value.endsWith('"')) ||
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

const db=postgres(
  url,
  {
    max:1,
    prepare:false,
    ssl:"require"
  }
);

try{

  await db.unsafe(
    fs.readFileSync(
      "drizzle/0023_app_private_function_privilege_hardening.sql",
      "utf8"
    )
  );

  console.log(
    "app_private function privilege hardening 0023 executed."
  );


  console.log();
  console.log(
    "===== PUBLIC EXECUTE AUDIT ====="
  );

  const publicExecutable=await db`
    select
      p.oid::regprocedure::text as function_signature
    from pg_proc p
    join pg_namespace n
      on n.oid=p.pronamespace
    where n.nspname='app_private'
      and has_function_privilege(
        'public',
        p.oid,
        'EXECUTE'
      )
    order by
      p.oid::regprocedure::text
  `;

  if(publicExecutable.length){
    console.log(
      JSON.stringify(
        publicExecutable,
        null,
        2
      )
    );

    throw new Error(
      "One or more app_private functions remain PUBLIC executable."
    );
  }

  console.log(
    "PUBLIC executable app_private functions: NONE"
  );


  console.log();
  console.log(
    "===== DEFAULT PRIVILEGE AUDIT ====="
  );

  const defaults=(await db`
    select exists(
      select 1
      from pg_default_acl d

      cross join lateral
        aclexplode(d.defaclacl) a

      join pg_roles owner
        on owner.oid=d.defaclrole

      where owner.rolname='vnext_migrator'
        and d.defaclnamespace='app_private'::regnamespace
        and d.defaclobjtype='f'
        and a.grantee=0
        and a.privilege_type='EXECUTE'
    ) as public_default_execute
  `)[0];

  console.log(
    `Future app_private PUBLIC EXECUTE default: ${
      defaults.public_default_execute
        ? "ENABLED"
        : "DENIED"
    }`
  );

  if(defaults.public_default_execute){
    throw new Error(
      "vnext_migrator still grants PUBLIC EXECUTE by default in app_private."
    );
  }

  console.log(
    "Future app_private function default privilege: PASS"
  );


  console.log();
  console.log(
    "===== LEGACY TRIGGER FUNCTION DENIAL ====="
  );

  const triggerPrivileges=(await db`
    select
      has_function_privilege(
        'public',
        'app_private.prevent_organization_name_change()',
        'EXECUTE'
      ) as public_execute,

      has_function_privilege(
        'anon',
        'app_private.prevent_organization_name_change()',
        'EXECUTE'
      ) as anon_execute,

      has_function_privilege(
        'authenticated',
        'app_private.prevent_organization_name_change()',
        'EXECUTE'
      ) as authenticated_execute,

      has_function_privilege(
        'vnext_runtime',
        'app_private.prevent_organization_name_change()',
        'EXECUTE'
      ) as runtime_execute,

      has_function_privilege(
        'vnext_evidence_worker',
        'app_private.prevent_organization_name_change()',
        'EXECUTE'
      ) as evidence_worker_execute,

      has_function_privilege(
        'vnext_occurrence_worker',
        'app_private.prevent_organization_name_change()',
        'EXECUTE'
      ) as occurrence_worker_execute
  `)[0];

  console.log(
    JSON.stringify(
      triggerPrivileges,
      null,
      2
    )
  );

  if(
    Object.values(triggerPrivileges)
      .some(Boolean)
  ){
    throw new Error(
      "Legacy Organization trigger function remains executable by an unauthorized role."
    );
  }

  console.log(
    "Legacy trigger function unauthorized EXECUTE: DENIED"
  );


  console.log();
  console.log(
    "===== ORGANIZATION TRIGGER PRESERVED ====="
  );

  const trigger=(await db`
    select exists(
      select 1
      from pg_trigger t
      join pg_proc p
        on p.oid=t.tgfoid
      join pg_class c
        on c.oid=t.tgrelid
      join pg_namespace n
        on n.oid=p.pronamespace
      where not t.tgisinternal
        and c.relname='organization'
        and t.tgname='organization_name_immutable'
        and n.nspname='app_private'
        and p.proname='prevent_organization_name_change'
    ) as exists
  `)[0];

  if(!trigger.exists){
    throw new Error(
      "Organization-name immutability trigger was lost."
    );
  }

  console.log(
    "Organization-name immutability trigger: PRESENT"
  );


  console.log();
  console.log(
    "===== OCCURRENCE WORKER CONTRACT PRESERVED ====="
  );

  const occurrence=(await db`
    select
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
      ) as additive_execute
  `)[0];

  if(
    !occurrence.claim_execute ||
    !occurrence.complete_execute ||
    !occurrence.fail_execute ||
    occurrence.additive_execute
  ){
    throw new Error(
      "0023 altered the Occurrence worker command contract."
    );
  }

  console.log(
    "Occurrence worker explicit commands preserved: PASS"
  );


  console.log();
  console.log(
    "app_private Function Privilege Hardening 0023 applied and verified."
  );

}finally{

  await db.end({
    timeout:5
  });

}
