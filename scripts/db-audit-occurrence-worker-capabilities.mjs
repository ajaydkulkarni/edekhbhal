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

const url=
  process.env.MIGRATION_DATABASE_URL;

if(!url){
  throw new Error(
    "MIGRATION_DATABASE_URL is required."
  );
}

const roleName=
  "vnext_occurrence_worker";

const expectedFunctions=[
  "app_private.claim_occurrence_generation_schedule(text,integer)",
  "app_private.complete_occurrence_generation_claim(uuid,uuid,text)",
  "app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)"
];

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
    "===== OCCURRENCE WORKER ROLE ATTRIBUTES ====="
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
    where rolname=${roleName}
  `)[0];

  if(!role){
    throw new Error(
      "vnext_occurrence_worker is missing."
    );
  }

  console.log(
    JSON.stringify(
      role,
      null,
      2
    )
  );

  if(
    role.rolsuper ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolbypassrls ||
    role.rolcanlogin
  ){
    throw new Error(
      "Occurrence worker capability role has unsafe attributes."
    );
  }

  console.log(
    "Capability role safety: PASS"
  );


  console.log();
  console.log(
    "===== PUBLIC app_private EXECUTE ====="
  );

  const publicExecutable=await db`
    select
      p.oid::regprocedure::text as signature
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

  console.log(
    `PUBLIC executable app_private count: ${publicExecutable.length}`
  );

  if(publicExecutable.length){
    console.log(
      JSON.stringify(
        publicExecutable,
        null,
        2
      )
    );

    throw new Error(
      "PUBLIC EXECUTE drift detected in app_private."
    );
  }

  console.log(
    "PUBLIC executable app_private functions: NONE"
  );


  console.log();
  console.log(
    "===== EXACT WORKER FUNCTION SURFACE ====="
  );

  const executable=await db`
    select
      p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n
      on n.oid=p.pronamespace
    where n.nspname='app_private'
      and has_function_privilege(
        ${roleName},
        p.oid,
        'EXECUTE'
      )
    order by
      p.oid::regprocedure::text
  `;

  const actual=
    executable.map(
      row=>row.signature
    );

  console.log(
    JSON.stringify(
      actual,
      null,
      2
    )
  );

  const missing=
    expectedFunctions.filter(
      fn=>!actual.includes(fn)
    );

  const unexpected=
    actual.filter(
      fn=>!expectedFunctions.includes(fn)
    );

  console.log(
    `Executable app_private function count: ${actual.length}`
  );

  console.log(
    `Missing expected functions: ${JSON.stringify(missing)}`
  );

  console.log(
    `Unexpected functions: ${JSON.stringify(unexpected)}`
  );

  if(
    actual.length!==expectedFunctions.length ||
    missing.length ||
    unexpected.length
  ){
    throw new Error(
      "Occurrence worker function capability surface is not exactly the intended three commands."
    );
  }

  console.log(
    "Exactly three worker commands: PASS"
  );


  console.log();
  console.log(
    "===== ROLE MEMBERSHIP SURFACE ====="
  );

  const memberships=await db`
    select
      parent.rolname as inherited_role
    from pg_auth_members m
    join pg_roles member
      on member.oid=m.member
    join pg_roles parent
      on parent.oid=m.roleid
    where member.rolname=${roleName}
    order by parent.rolname
  `;

  if(memberships.length){
    console.log(
      JSON.stringify(
        memberships,
        null,
        2
      )
    );

    throw new Error(
      "Occurrence worker capability role inherits unauthorized PostgreSQL roles."
    );
  }

  console.log(
    "Inherited PostgreSQL roles: NONE"
  );


  console.log();
  console.log(
    "===== SENSITIVE TABLE PRIVILEGE SURFACE ====="
  );

  const tablePrivileges=await db`
    with targets(
      schema_name,
      table_name
    ) as (
      values
        ('public','organization'),
        ('public','site'),
        ('public','work_area'),
        ('public','schedule_master'),
        ('public','schedule_task'),
        ('public','schedule_occurrence'),
        ('public','schedule_occurrence_task'),
        ('public','schedule_occurrence_generation_state'),
        ('public','audit_event'),
        ('public','outbox_event')
    )
    select
      schema_name,
      table_name,

      has_table_privilege(
        ${roleName},
        format(
          '%I.%I',
          schema_name,
          table_name
        ),
        'SELECT'
      ) as can_select,

      has_table_privilege(
        ${roleName},
        format(
          '%I.%I',
          schema_name,
          table_name
        ),
        'INSERT'
      ) as can_insert,

      has_table_privilege(
        ${roleName},
        format(
          '%I.%I',
          schema_name,
          table_name
        ),
        'UPDATE'
      ) as can_update,

      has_table_privilege(
        ${roleName},
        format(
          '%I.%I',
          schema_name,
          table_name
        ),
        'DELETE'
      ) as can_delete

    from targets
    order by
      schema_name,
      table_name
  `;

  const violations=
    tablePrivileges.filter(
      row=>
        row.can_select ||
        row.can_insert ||
        row.can_update ||
        row.can_delete
    );

  if(violations.length){
    console.log(
      JSON.stringify(
        violations,
        null,
        2
      )
    );

    throw new Error(
      "Occurrence worker has effective sensitive-table privileges."
    );
  }

  console.log(
    "Effective sensitive-table privileges: NONE"
  );


  console.log();
  console.log(
    "===== REQUIRED SCHEMA PRIVILEGE ====="
  );

  const schemaUsage=Boolean(
    (
      await db`
        select has_schema_privilege(
          ${roleName},
          'app_private',
          'USAGE'
        ) as allowed
      `
    )[0]?.allowed
  );

  console.log(
    `app_private USAGE: ${schemaUsage}`
  );

  if(!schemaUsage){
    throw new Error(
      "Occurrence worker lacks required app_private USAGE."
    );
  }

  console.log(
    "Required schema privilege: PASS"
  );


  console.log();
  console.log(
    "===== FUTURE PRIVATE FUNCTION DEFAULT ====="
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
        and d.defaclnamespace=
          'app_private'::regnamespace
        and d.defaclobjtype='f'
        and a.grantee=0
        and a.privilege_type='EXECUTE'
    ) as public_execute
  `)[0];

  console.log(
    `Future PUBLIC EXECUTE default: ${
      defaults.public_execute
        ? "ENABLED"
        : "DENIED"
    }`
  );

  if(defaults.public_execute){
    throw new Error(
      "Future app_private functions default to PUBLIC EXECUTE."
    );
  }

  console.log(
    "Future app_private privilege default: PASS"
  );


  console.log();
  console.log(
    "04A EXHAUSTIVE OCCURRENCE WORKER CAPABILITY AUDIT: PASS"
  );

}finally{

  await db.end({
    timeout:5
  });

}
