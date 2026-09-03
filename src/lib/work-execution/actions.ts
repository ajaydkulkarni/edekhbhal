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
