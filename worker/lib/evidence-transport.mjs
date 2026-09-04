import fs from "node:fs";
import postgres from "postgres";
import {createClient} from "@supabase/supabase-js";

export function loadWorkerEnv(){
  for(const path of [".env.worker.local",".env.local"]){
    if(!fs.existsSync(path))continue;
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
}

function requireEnv(name){
  const value=process.env[name]?.trim();
  if(!value)throw new Error(`${name} is required.`);
  return value;
}

export async function openEvidenceWorkerTransport(){
  loadWorkerEnv();

  const databaseUrl=requireEnv("EVIDENCE_WORKER_DATABASE_URL");
  const workerId=requireEnv("EVIDENCE_WORKER_ID");
  const supabaseUrl=requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey=requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const storageEmail=requireEnv("EVIDENCE_STORAGE_WORKER_EMAIL");
  const storagePassword=requireEnv("EVIDENCE_STORAGE_WORKER_PASSWORD");

  if(workerId.length>200)throw new Error("EVIDENCE_WORKER_ID cannot exceed 200 characters.");

  const db=postgres(databaseUrl,{max:2,prepare:false,ssl:"require"});
  const identity=(await db`
    select
      current_user,
      pg_has_role(current_user,'vnext_evidence_worker','member') as capability_member,
      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls
    from pg_roles r
    where r.rolname=current_user
  `)[0];

  if(!identity)throw new Error("Unable to inspect Evidence worker database identity.");
  if(!identity.capability_member)
    throw new Error(`Database LOGIN ${identity.current_user} does not inherit vnext_evidence_worker.`);
  if(identity.rolsuper||identity.rolcreatedb||identity.rolcreaterole||identity.rolreplication||identity.rolbypassrls)
    throw new Error("Evidence worker database LOGIN has unsafe role attributes.");

  const supabase=createClient(supabaseUrl,publishableKey,{
    auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}
  });
  const {data,error}=await supabase.auth.signInWithPassword({
    email:storageEmail,
    password:storagePassword
  });
  if(error||!data.user){
    await db.end({timeout:5});
    throw new Error(`Evidence Storage worker sign-in failed: ${error?.message??"no user returned"}`);
  }

  const storageAuthSubject=data.user.id;
  const principal=(await db`
    select app_private.assert_evidence_worker_storage_principal(
      ${storageAuthSubject}::uuid,${workerId}
    ) as ok
  `)[0]?.ok;
  if(!principal){
    await db.end({timeout:5});
    throw new Error("Storage Auth subject is not the ACTIVE machine principal for EVIDENCE_WORKER_ID.");
  }

  const capabilities=(await db`
    select
      has_function_privilege(current_user,'app_private.claim_evidence_worker_event(text,integer)','EXECUTE') q_claim,
      has_function_privilege(current_user,'app_private.renew_evidence_worker_event_lease(uuid,uuid,text,integer)','EXECUTE') q_renew,
      has_function_privilege(current_user,'app_private.claim_evidence_processing(uuid,bigint,text,text)','EXECUTE') p_claim,
      has_function_privilege(current_user,'app_private.renew_evidence_processing_lease(uuid,bigint,uuid,text,integer)','EXECUTE') p_renew,
      has_function_privilege(current_user,'app_private.get_evidence_processing_targets(uuid,bigint,uuid,text)','EXECUTE') targets,
      has_function_privilege(
        current_user,
        'app_private.complete_evidence_processing_transport(uuid,bigint,uuid,text,text,text,bigint,text,bigint,boolean,text,text)',
        'EXECUTE'
      ) transport_complete,
      has_function_privilege(
        current_user,
        'app_private.complete_evidence_processing(uuid,bigint,uuid,text,text,text,bigint,text,text,text,bigint,text,boolean,text,text)',
        'EXECUTE'
      ) legacy_complete
  `)[0];
  if(!capabilities.q_claim||!capabilities.q_renew||!capabilities.p_claim||
     !capabilities.p_renew||!capabilities.targets||!capabilities.transport_complete)
    throw new Error("Evidence worker database LOGIN is missing 03B1 capabilities.");
  if(capabilities.legacy_complete)
    throw new Error("Evidence worker database LOGIN must not inherit legacy free-form processing completion.");

  return {
    db,
    supabase,
    workerId,
    storageAuthSubject,
    databaseRole:identity.current_user,
    async claimEvent(leaseSeconds=90){
      return (await db`
        select * from app_private.claim_evidence_worker_event(${workerId},${leaseSeconds})
      `)[0]??null;
    },
    async renewEventLease(eventId,claimToken,leaseSeconds=90){
      return (await db`
        select app_private.renew_evidence_worker_event_lease(
          ${eventId}::uuid,${claimToken}::uuid,${workerId},${leaseSeconds}
        ) as lease_until
      `)[0].lease_until;
    },
    async claimProcessing(evidenceId,expectedVersion,idempotencyKey){
      return (await db`
        select * from app_private.claim_evidence_processing(
          ${evidenceId}::uuid,${expectedVersion},${workerId},${idempotencyKey}
        )
      `)[0];
    },
    async renewProcessingLease(evidenceId,expectedVersion,claimToken,leaseSeconds=300){
      return (await db`
        select app_private.renew_evidence_processing_lease(
          ${evidenceId}::uuid,${expectedVersion},${claimToken}::uuid,${workerId},${leaseSeconds}
        ) as lease_until
      `)[0].lease_until;
    },
    async getProcessingTargets(evidenceId,expectedVersion,claimToken){
      return (await db`
        select * from app_private.get_evidence_processing_targets(
          ${evidenceId}::uuid,${expectedVersion},${claimToken}::uuid,${workerId}
        )
      `)[0];
    },
    async completeProcessing({
      evidenceId,expectedVersion,claimToken,result,
      observedContentType,observedByteSize,observedSha256Hex,
      normalizedByteSize=null,retainOriginal=false,reason=null,idempotencyKey
    }){
      return (await db`
        select app_private.complete_evidence_processing_transport(
          ${evidenceId}::uuid,${expectedVersion},${claimToken}::uuid,${workerId},
          ${result},${observedContentType},${observedByteSize},${observedSha256Hex},
          ${normalizedByteSize},${retainOriginal},${reason},${idempotencyKey}
        ) as evidence_id
      `)[0].evidence_id;
    },
    async completeEvent(eventId,claimToken){
      return (await db`
        select app_private.complete_evidence_worker_event(
          ${eventId}::uuid,${claimToken}::uuid,${workerId}
        ) as event_id
      `)[0].event_id;
    },
    async failEvent(eventId,claimToken,message,retryAfterSeconds=60){
      return (await db`
        select app_private.fail_evidence_worker_event(
          ${eventId}::uuid,${claimToken}::uuid,${workerId},${message},${retryAfterSeconds}
        ) as event_id
      `)[0].event_id;
    },
    async markOriginalDeleted(evidenceId,expectedVersion,objectKey,idempotencyKey){
      return (await db`
        select app_private.mark_evidence_original_deleted(
          ${evidenceId}::uuid,${expectedVersion},${objectKey},${workerId},${idempotencyKey}
        ) as evidence_id
      `)[0].evidence_id;
    },
    async downloadObject(bucket,objectKey){
      const {data:blob,error:storageError}=await supabase.storage.from(bucket).download(objectKey);
      if(storageError||!blob)throw new Error(`Storage download failed: ${storageError?.message??"no object returned"}`);
      return Buffer.from(await blob.arrayBuffer());
    },
    async uploadObject(bucket,objectKey,body,contentType){
      const {error:storageError}=await supabase.storage.from(bucket).upload(
        objectKey,body,{contentType,upsert:true}
      );
      if(storageError)throw new Error(`Storage upload failed: ${storageError.message}`);
    },
    async deleteObject(bucket,objectKey){
      const {error:storageError}=await supabase.storage.from(bucket).remove([objectKey]);
      if(storageError)throw new Error(`Storage delete failed: ${storageError.message}`);
    },
    async close(){
      await db.end({timeout:5});
    }
  };
}
