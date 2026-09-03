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

const path="drizzle/0016_evidence_capture_foundation.sql";
const sql=fs.readFileSync(path,"utf8");
const db=postgres(url,{max:1,prepare:false,ssl:"require"});

try{
  await db.unsafe(sql);

  const columns=await db`
    select column_name
    from information_schema.columns
    where table_schema='public'
      and table_name='schedule_occurrence_evidence'
      and column_name in(
        'storage_bucket','upload_status','upload_expires_at','uploaded_at',
        'original_filename','normalized_object_key','preview_object_key',
        'verification_reason','version'
      )
  `;
  if(columns.length!==9)throw new Error(`0016 verification expected 9 Evidence columns, found ${columns.length}.`);

  const functions=await db`
    select n.nspname,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='app_private' and p.proname in(
      'create_evidence_upload_intent','finalize_evidence_upload','audit_occurrence_evidence_event'
    ))
    or (n.nspname='public' and p.proname in(
      'storage_can_write_occurrence_evidence','storage_can_read_occurrence_evidence'
    ))
  `;
  if(functions.length!==5)throw new Error(`0016 verification expected 5 Evidence functions, found ${functions.length}.`);

  const priv=(await db`
    select
      has_function_privilege(
        'vnext_runtime',
        'app_private.create_evidence_upload_intent(uuid,bigint,schedule_random_evidence_type,text,text,bigint,text,text)',
        'EXECUTE'
      ) intent_exec,
      has_function_privilege(
        'vnext_runtime',
        'app_private.finalize_evidence_upload(uuid,bigint,text,text,text)',
        'EXECUTE'
      ) finalize_exec,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_evidence','INSERT') evidence_insert,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_evidence','UPDATE') evidence_update,
      has_table_privilege('vnext_runtime','public.schedule_occurrence_evidence','DELETE') evidence_delete
  `)[0];

  if(!priv.intent_exec||!priv.finalize_exec)throw new Error("0016 Evidence command grants are incomplete.");
  if(priv.evidence_insert||priv.evidence_update||priv.evidence_delete){
    throw new Error("0016 must not grant direct runtime Evidence DML.");
  }

  console.log("Evidence Capture & Media Pipeline Foundation 01 applied and verified.");
  console.log("Supabase Storage bucket/policies are NOT applied by vnext_migrator.");
  console.log("Use supabase-storage/001_occurrence_evidence_private_bucket.sql separately with platform-owner privileges.");
}finally{
  await db.end({timeout:5});
}
