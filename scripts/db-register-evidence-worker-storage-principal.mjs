import fs from "node:fs";
import postgres from "postgres";
import {createClient} from "@supabase/supabase-js";

function loadEnv(path){
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
loadEnv(".env.worker.local");
loadEnv(".env.local");

const migrationUrl=process.env.MIGRATION_DATABASE_URL;
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const workerId=process.env.EVIDENCE_WORKER_ID?.trim();
const email=process.env.EVIDENCE_STORAGE_WORKER_EMAIL?.trim();
const password=process.env.EVIDENCE_STORAGE_WORKER_PASSWORD;

for(const [name,value] of Object.entries({
  MIGRATION_DATABASE_URL:migrationUrl,
  NEXT_PUBLIC_SUPABASE_URL:supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publishableKey,
  EVIDENCE_WORKER_ID:workerId,
  EVIDENCE_STORAGE_WORKER_EMAIL:email,
  EVIDENCE_STORAGE_WORKER_PASSWORD:password
})){
  if(!value)throw new Error(`${name} is required.`);
}
if(workerId.length>200)throw new Error("EVIDENCE_WORKER_ID cannot exceed 200 characters.");

const supabase=createClient(supabaseUrl,publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const {data,error}=await supabase.auth.signInWithPassword({email,password});
if(error||!data.user)throw new Error(`Evidence Storage worker sign-in failed: ${error?.message??"no user returned"}`);
const authSubject=data.user.id;

const db=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
try{
  const appUser=await db`
    select id from public.app_user where auth_subject=${authSubject} limit 1
  `;
  if(appUser.length)
    throw new Error("The worker Auth subject is mapped to an application user. Use a dedicated machine Auth account with no app_user/membership.");

  const byWorker=await db`
    select auth_subject::text as auth_subject
    from app_private.evidence_worker_storage_principal
    where worker_id=${workerId}
  `;
  if(byWorker.length&&byWorker[0].auth_subject!==authSubject)
    throw new Error("EVIDENCE_WORKER_ID is already mapped to another Auth subject; rotate explicitly instead of silently replacing it.");

  const byAuth=await db`
    select worker_id
    from app_private.evidence_worker_storage_principal
    where auth_subject=${authSubject}::uuid
  `;
  if(byAuth.length&&byAuth[0].worker_id!==workerId)
    throw new Error("This Auth subject is already mapped to another worker id; rotate explicitly instead of silently replacing it.");

  await db`
    insert into app_private.evidence_worker_storage_principal(
      auth_subject,worker_id,status,created_at,updated_at
    ) values(${authSubject}::uuid,${workerId},'ACTIVE',now(),now())
    on conflict(auth_subject) do update
      set status='ACTIVE',updated_at=now()
  `;

  const ok=(await db`
    select app_private.assert_evidence_worker_storage_principal(${authSubject}::uuid,${workerId}) as ok
  `)[0]?.ok;
  if(!ok)throw new Error("Worker Storage principal registration verification failed.");

  console.log("Evidence Storage worker machine principal registered and verified.");
  console.log(`Auth subject: ${authSubject}`);
  console.log(`Worker id: ${workerId}`);
  console.log("The machine Auth account has no application user/membership mapping.");
  console.log("No service-role/secret API key or S3 credential was used.");
}finally{
  await db.end({timeout:5});
}
