"use server";
import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {withTenantContext} from "@/db/runtime";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot} from "@/lib/onboarding/server";
import {buildScheduleTaskInputs,normalizeRecurrence,splitLocalDateTime,type EvidenceRule,type RandomEvidenceType,type ScheduleFrequency} from "@/lib/schedules/model";

const schema=z.object({
 scheduleId:z.string().uuid().optional(),workAreaId:z.string().uuid(),name:z.string().trim().min(2).max(500),
 documentReference:z.string().trim().max(150).optional().default(""),documentRevision:z.string().trim().max(100).optional().default(""),
 frequencyType:z.enum(["ONE_TIME","RECURRING"]),recurrenceUnit:z.enum(["MINUTE","HOUR","DAY","WEEK","MONTH","YEAR"]).optional(),
 recurrenceInterval:z.coerce.number().int().min(1).max(100000).optional(),startLocal:z.string().min(1),endLocalDate:z.string().optional().default(""),
 expectedVersion:z.coerce.number().int().positive().optional(),idempotencyKey:z.string().uuid().optional()
});

async function currentContext(){const user=await requireAuthenticatedUser();const s=await getOnboardingSnapshot(user.id);if(!s?.app_user_id||!s.organization_id||!s.membership_id)redirect("/workspace");return{userId:s.app_user_id,organizationId:s.organization_id,membershipId:s.membership_id}}
function numberList(v:FormDataEntryValue|null){return v?String(v).split(",").map(x=>Number(x.trim())).filter(Number.isInteger):[]}
function tasksFrom(formData:FormData){
 const ids=formData.getAll("taskId").map(String);
 return buildScheduleTaskInputs(ids.map(taskId=>({
  taskId,sequence:Number(formData.get(`sequence_${taskId}`)),plannedDurationMinutes:Number(formData.get(`duration_${taskId}`)),
  evidenceRule:String(formData.get(`evidence_${taskId}`)??"NONE") as EvidenceRule,
  randomEveryN:Number(formData.get(`randomEveryN_${taskId}`)||3),
  randomEvidenceType:String(formData.get(`randomEvidenceType_${taskId}`)??"EITHER") as RandomEvidenceType
 })));
}
function parse(formData:FormData){
 const p=schema.parse({
  scheduleId:formData.get("scheduleId")||undefined,workAreaId:formData.get("workAreaId"),name:formData.get("name"),
  documentReference:formData.get("documentReference")??"",documentRevision:formData.get("documentRevision")??"",
  frequencyType:formData.get("frequencyType"),recurrenceUnit:formData.get("recurrenceUnit")||undefined,
  recurrenceInterval:formData.get("recurrenceInterval")||undefined,startLocal:formData.get("startLocal"),
  endLocalDate:formData.get("endLocalDate")??"",expectedVersion:formData.get("expectedVersion")||undefined,
  idempotencyKey:formData.get("idempotencyKey")||undefined
 });
 const {localDate,localTime}=splitLocalDateTime(p.startLocal);
 const recurrence=normalizeRecurrence({frequencyType:p.frequencyType as ScheduleFrequency,recurrenceUnit:p.recurrenceUnit,recurrenceInterval:p.recurrenceInterval,weekdays:formData.getAll("weekday").map(Number),monthDays:numberList(formData.get("monthDays")),endLocalDate:p.endLocalDate||null});
 if(recurrence.endLocalDate&&recurrence.endLocalDate<localDate)throw new Error("Schedule End Date cannot be before the Start Date.");
 return{...p,localDate,localTime,recurrence,tasks:tasksFrom(formData)};
}
const errorText=(e:unknown)=>encodeURIComponent(e instanceof Error?e.message:"Schedule operation failed.");

export async function createSchedule(formData:FormData){
 const context=await currentContext();
 try{
  const i=parse(formData),key=i.idempotencyKey??randomUUID();
  await withTenantContext(context,tx=>tx`select app_private.create_schedule_master(
   ${i.workAreaId},${i.name},${i.documentReference},${i.documentRevision},${i.frequencyType}::schedule_frequency_type,
   ${i.recurrence.recurrenceUnit}::schedule_recurrence_unit,${i.recurrence.recurrenceInterval},
   ${i.recurrence.recurrenceConfig?tx.json(i.recurrence.recurrenceConfig):null},
   ${i.localDate}::date,${i.localTime}::time,${i.recurrence.endLocalDate}::date,${tx.json(i.tasks)},${key})`);
 }catch(e){redirect(`/workspace/schedules?error=${errorText(e)}`)}
 revalidatePath("/workspace/schedules");revalidatePath("/workspace");redirect("/workspace/schedules?message=Schedule%20created.");
}

export async function updateSchedule(formData:FormData){
 const context=await currentContext();
 try{
  const i=parse(formData),scheduleId=i.scheduleId,expectedVersion=i.expectedVersion;if(!scheduleId||!expectedVersion)throw new Error("Schedule version is required.");
  await withTenantContext(context,tx=>tx`select app_private.update_schedule_master(
   ${scheduleId},${i.workAreaId},${i.name},${i.documentReference},${i.documentRevision},${i.frequencyType}::schedule_frequency_type,
   ${i.recurrence.recurrenceUnit}::schedule_recurrence_unit,${i.recurrence.recurrenceInterval},
   ${i.recurrence.recurrenceConfig?tx.json(i.recurrence.recurrenceConfig):null},
   ${i.localDate}::date,${i.localTime}::time,${i.recurrence.endLocalDate}::date,${tx.json(i.tasks)},${expectedVersion})`);
 }catch(e){redirect(`/workspace/schedules?error=${errorText(e)}`)}
 revalidatePath("/workspace/schedules");revalidatePath("/workspace");redirect("/workspace/schedules?message=Schedule%20updated.");
}

export async function toggleScheduleStatus(formData:FormData){
 const context=await currentContext(),id=z.string().uuid().parse(formData.get("scheduleId")),version=z.coerce.number().int().positive().parse(formData.get("expectedVersion")),current=z.enum(["ACTIVE","INACTIVE"]).parse(formData.get("currentStatus")),next=current==="ACTIVE"?"INACTIVE":"ACTIVE";
 try{await withTenantContext(context,tx=>tx`select app_private.set_schedule_master_status(${id},${next}::record_status,${version})`)}
 catch(e){redirect(`/workspace/schedules?error=${errorText(e)}`)}
 revalidatePath("/workspace/schedules");revalidatePath("/workspace");redirect("/workspace/schedules");
}
