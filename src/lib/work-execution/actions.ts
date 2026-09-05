"use server";
import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {withTenantContext} from "@/db/runtime";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot} from "@/lib/onboarding/server";

async function currentContext(){
 const user=await requireAuthenticatedUser();
 const s=await getOnboardingSnapshot(user.id);
 if(!s?.app_user_id||!s.organization_id||!s.membership_id)redirect("/workspace");
 return{userId:s.app_user_id,organizationId:s.organization_id,membershipId:s.membership_id};
}
const err=(e:unknown)=>encodeURIComponent(e instanceof Error?e.message:"Work execution operation failed.");

export async function claimOccurrence(formData:FormData){
 const context=await currentContext();
 const id=z.string().uuid().parse(formData.get("occurrenceId"));
 const key=z.string().uuid().catch(randomUUID()).parse(formData.get("idempotencyKey")||randomUUID());
 try{
  await withTenantContext(context,tx=>tx`select app_private.claim_occurrence(${id},${key},'WEB')`);
 }catch(e){redirect(`/workspace/my-work?error=${err(e)}`)}
 revalidatePath("/workspace/my-work");revalidatePath("/workspace/occurrences");redirect("/workspace/my-work?message=Work%20claimed.");
}

export async function startOccurrence(formData:FormData){
 const context=await currentContext();
 const id=z.string().uuid().parse(formData.get("occurrenceId"));
 const token=z.string().trim().min(8).parse(formData.get("qrToken"));
 const key=z.string().uuid().catch(randomUUID()).parse(formData.get("idempotencyKey")||randomUUID());
 try{
  await withTenantContext(context,tx=>tx`select app_private.start_occurrence_with_qr(${id},${token},${key},'WEB')`);
 }catch(e){redirect(`/workspace/my-work?error=${err(e)}`)}
 revalidatePath("/workspace/my-work");revalidatePath("/workspace/occurrences");redirect("/workspace/my-work?message=Work%20started.");
}

export async function completeOccurrenceTask(formData:FormData){
 const context=await currentContext();
 const taskId=z.string().uuid().parse(formData.get("occurrenceTaskId"));
 const version=z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
 const notes=z.string().trim().max(4000).optional().catch("").parse(formData.get("notes")||"");
 const key=z.string().uuid().catch(randomUUID()).parse(formData.get("idempotencyKey")||randomUUID());
 try{
  await withTenantContext(context,tx=>tx`
   select app_private.complete_occurrence_task(${taskId},${version},${notes||null},${key},'WEB')
  `);
 }catch(e){redirect(`/workspace/my-work?error=${err(e)}`)}
 revalidatePath("/workspace/my-work");revalidatePath("/workspace/occurrences");
 redirect("/workspace/my-work?message=Task%20completed.");
}

export async function partiallyCompleteOccurrence(formData:FormData){
 const context=await currentContext();
 const id=z.string().uuid().parse(formData.get("occurrenceId"));
 const version=z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
 const reason=z.string().trim().min(3).max(1000).parse(formData.get("reason"));
 const key=z.string().uuid().catch(randomUUID()).parse(formData.get("idempotencyKey")||randomUUID());
 try{
  await withTenantContext(context,tx=>tx`
   select app_private.partially_complete_occurrence(${id},${version},${reason},${key},'WEB')
  `);
 }catch(e){redirect(`/workspace/my-work?error=${err(e)}`)}
 revalidatePath("/workspace/my-work");revalidatePath("/workspace/occurrences");
 redirect("/workspace/my-work?message=Work%20ended%20as%20partially%20completed.");
}

const mobileFocusPath=(occurrenceId:string)=>`/workspace/my-work/${occurrenceId}`;

export async function claimOccurrenceMobile(formData:FormData){
 const context=await currentContext();
 const id=z.string().uuid().parse(formData.get("occurrenceId"));
 const key=z.string().uuid().catch(randomUUID()).parse(
  formData.get("idempotencyKey")||randomUUID()
 );

 try{
  await withTenantContext(
   context,
   tx=>tx`select app_private.claim_occurrence(${id},${key},'MOBILE')`
  );
 }catch(e){
  redirect(`${mobileFocusPath(id)}?error=${err(e)}`);
 }

 revalidatePath("/workspace/my-work");
 revalidatePath(mobileFocusPath(id));
 revalidatePath("/workspace/occurrences");

 redirect(`${mobileFocusPath(id)}?message=Work%20claimed.`);
}

export async function startOccurrenceMobile(formData:FormData){
 const context=await currentContext();
 const id=z.string().uuid().parse(formData.get("occurrenceId"));
 const token=z.string().trim().min(8).parse(formData.get("qrToken"));
 const key=z.string().uuid().catch(randomUUID()).parse(
  formData.get("idempotencyKey")||randomUUID()
 );

 try{
  await withTenantContext(
   context,
   tx=>tx`
    select app_private.start_occurrence_with_qr(
     ${id},
     ${token},
     ${key},
     'MOBILE'
    )
   `
  );
 }catch(e){
  redirect(`${mobileFocusPath(id)}?error=${err(e)}`);
 }

 revalidatePath("/workspace/my-work");
 revalidatePath(mobileFocusPath(id));
 revalidatePath("/workspace/occurrences");

 redirect(`${mobileFocusPath(id)}?message=Work%20started.`);
}

export async function completeOccurrenceTaskMobile(formData:FormData){
 const context=await currentContext();

 const occurrenceId=z.string().uuid().parse(
  formData.get("occurrenceId")
 );
 const taskId=z.string().uuid().parse(
  formData.get("occurrenceTaskId")
 );
 const version=z.coerce.number().int().positive().parse(
  formData.get("expectedVersion")
 );
 const notes=z.string().trim().max(4000).optional().catch("").parse(
  formData.get("notes")||""
 );
 const key=z.string().uuid().catch(randomUUID()).parse(
  formData.get("idempotencyKey")||randomUUID()
 );

 try{
  await withTenantContext(
   context,
   tx=>tx`
    select app_private.complete_occurrence_task(
     ${taskId},
     ${version},
     ${notes||null},
     ${key},
     'MOBILE'
    )
   `
  );
 }catch(e){
  redirect(`${mobileFocusPath(occurrenceId)}?error=${err(e)}`);
 }

 revalidatePath("/workspace/my-work");
 revalidatePath(mobileFocusPath(occurrenceId));
 revalidatePath("/workspace/occurrences");

 redirect(
  `${mobileFocusPath(occurrenceId)}?message=Task%20completed.`
 );
}

export async function partiallyCompleteOccurrenceMobile(formData:FormData){
 const context=await currentContext();

 const id=z.string().uuid().parse(formData.get("occurrenceId"));
 const version=z.coerce.number().int().positive().parse(
  formData.get("expectedVersion")
 );
 const reason=z.string().trim().min(3).max(1000).parse(
  formData.get("reason")
 );
 const key=z.string().uuid().catch(randomUUID()).parse(
  formData.get("idempotencyKey")||randomUUID()
 );

 try{
  await withTenantContext(
   context,
   tx=>tx`
    select app_private.partially_complete_occurrence(
     ${id},
     ${version},
     ${reason},
     ${key},
     'MOBILE'
    )
   `
  );
 }catch(e){
  redirect(`${mobileFocusPath(id)}?error=${err(e)}`);
 }

 revalidatePath("/workspace/my-work");
 revalidatePath(mobileFocusPath(id));
 revalidatePath("/workspace/occurrences");

 redirect(
  `${mobileFocusPath(id)}?message=Work%20ended%20as%20partially%20completed.`
 );
}


const evidenceIntentSchema=z.object({
 occurrenceTaskId:z.string().uuid(),
 expectedTaskVersion:z.number().int().positive(),
 evidenceType:z.enum(["PHOTO","VIDEO"]),
 originalFilename:z.string().trim().min(1).max(255),
 contentType:z.string().trim().min(1).max(100),
 byteSize:z.number().int().positive().max(209715200),
 idempotencyKey:z.string().uuid(),
});

export async function createEvidenceUploadIntent(input:z.infer<typeof evidenceIntentSchema>){
 const context=await currentContext();
 const p=evidenceIntentSchema.parse(input);
 const rows=await withTenantContext(context,tx=>tx<{
  result_evidence_id:string;
  result_storage_bucket:string;
  result_object_key:string;
  result_upload_expires_at:string;
  result_version:number|string;
 }[]>`
  select * from app_private.create_evidence_upload_intent(
   ${p.occurrenceTaskId},
   ${p.expectedTaskVersion},
   ${p.evidenceType}::schedule_random_evidence_type,
   ${p.originalFilename},
   ${p.contentType},
   ${p.byteSize},
   ${p.idempotencyKey},
   'WEB'
  )
 `);
 const row=rows[0];
 if(!row)throw new Error("Evidence upload intent was not created.");
 return{
  evidenceId:row.result_evidence_id,
  storageBucket:row.result_storage_bucket,
  objectKey:row.result_object_key,
  uploadExpiresAt:String(row.result_upload_expires_at),
  version:Number(row.result_version),
 };
}

const evidenceFinalizeSchema=z.object({
 evidenceId:z.string().uuid(),
 expectedVersion:z.number().int().positive(),
 sha256Hex:z.string().regex(/^[0-9a-fA-F]{64}$/),
 idempotencyKey:z.string().uuid(),
});

export async function finalizeEvidenceUpload(input:z.infer<typeof evidenceFinalizeSchema>){
 const context=await currentContext();
 const p=evidenceFinalizeSchema.parse(input);
 await withTenantContext(context,tx=>tx`
  select app_private.finalize_evidence_upload(
   ${p.evidenceId},
   ${p.expectedVersion},
   ${p.sha256Hex.toLowerCase()},
   ${p.idempotencyKey},
   'WEB'
  )
 `);
 revalidatePath("/workspace/my-work");
 return{evidenceId:p.evidenceId,uploadStatus:"UPLOADED" as const,verificationStatus:"PENDING" as const};
}

export async function createMobileEvidenceUploadIntent(
 input:z.infer<typeof evidenceIntentSchema>
){
 const context=await currentContext();
 const p=evidenceIntentSchema.parse(input);

 const rows=await withTenantContext(context,tx=>tx<{
  result_evidence_id:string;
  result_storage_bucket:string;
  result_object_key:string;
  result_upload_expires_at:string;
  result_version:number|string;
 }[]>`
  select * from app_private.create_evidence_upload_intent(
   ${p.occurrenceTaskId},
   ${p.expectedTaskVersion},
   ${p.evidenceType}::schedule_random_evidence_type,
   ${p.originalFilename},
   ${p.contentType},
   ${p.byteSize},
   ${p.idempotencyKey},
   'MOBILE'
  )
 `);

 const row=rows[0];
 if(!row)throw new Error("Evidence upload intent was not created.");

 return{
  evidenceId:row.result_evidence_id,
  storageBucket:row.result_storage_bucket,
  objectKey:row.result_object_key,
  uploadExpiresAt:String(row.result_upload_expires_at),
  version:Number(row.result_version),
 };
}

export async function finalizeMobileEvidenceUpload(
 input:z.infer<typeof evidenceFinalizeSchema>
){
 const context=await currentContext();
 const p=evidenceFinalizeSchema.parse(input);

 await withTenantContext(context,tx=>tx`
  select app_private.finalize_evidence_upload(
   ${p.evidenceId},
   ${p.expectedVersion},
   ${p.sha256Hex.toLowerCase()},
   ${p.idempotencyKey},
   'MOBILE'
  )
 `);

 revalidatePath("/workspace/my-work");

 return{
  evidenceId:p.evidenceId,
  uploadStatus:"UPLOADED" as const,
  verificationStatus:"PENDING" as const,
 };
}
