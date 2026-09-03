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

const migrationPath="drizzle/0015_occurrence_task_execution_idempotency_hardening.sql";
if(!fs.existsSync(migrationPath))throw new Error(`${migrationPath} is missing.`);

const migrationSql=fs.readFileSync(migrationPath,"utf8");
for(const required of[
  "another Task completion request",
  "another partial completion request",
  "'expectedVersion',p_expected_version",
  "'sourceChannel',p_source_channel"
]){
  if(!migrationSql.includes(required))throw new Error(`Migration 0015 is missing expected hardening marker: ${required}`);
}

const db=postgres(url,{max:1,prepare:false,ssl:"require"});

try{
  await db.unsafe(migrationSql);

  const defs=await db.unsafe(`
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname in ('complete_occurrence_task','partially_complete_occurrence')
  `);

  const combined=defs.map(row=>row.def).join("\n");
  for(const required of[
    "expectedVersion",
    "sourceChannel",
    "another Task completion request",
    "another partial completion request"
  ]){
    if(!combined.includes(required))throw new Error(`0015 verification missing ${required}`);
  }

  const privileges=await db.unsafe(`
    select
      has_function_privilege(
        'vnext_runtime',
        'app_private.complete_occurrence_task(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) as complete_exec,
      has_function_privilege(
        'vnext_runtime',
        'app_private.partially_complete_occurrence(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) as partial_exec,
      has_table_privilege(
        'vnext_runtime',
        'public.schedule_occurrence_task',
        'UPDATE'
      ) as task_update,
      has_table_privilege(
        'vnext_runtime',
        'public.schedule_occurrence',
        'UPDATE'
      ) as occurrence_update
  `);

  const p=privileges[0];
  if(!p.complete_exec||!p.partial_exec)throw new Error("0015 command grants are incomplete.");
  if(p.task_update||p.occurrence_update)throw new Error("0015 must not grant direct runtime Occurrence DML.");

  console.log("Occurrence Task Execution Idempotency Hardening 01 applied and verified.");
}finally{
  await db.end({timeout:5});
}
