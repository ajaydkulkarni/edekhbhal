import {NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {requireUser} from "@/lib/session";
import {audit} from "@/lib/audit";
import {buildOffsets,durationToMinutes,zonedLocalToUtc} from "@/lib/schedule";
import {reconcileScheduleOccurrences} from "@/lib/occurrenceGenerator";
import {canAccessProperty} from "@/lib/propertyAccess";

const scheduleTaskSchema=z.object({
 taskId:z.string().min(1).nullable().optional(),
 adHocName:z.string().trim().min(2).max(500).nullable().optional(),
 adHocDescription:z.string().max(5000).nullable().optional(),
 saveToLibrary:z.boolean().optional().default(false),
 sequence:z.number().int().positive(),
 duration:z.string().regex(/^\d{2}:[0-5]\d$/),
 evidenceRule:z.enum(["NONE","PHOTO","VIDEO","RANDOM"]),
 randomEveryN:z.number().int().min(2).max(1000).nullable().optional(),
 randomEvidenceType:z.enum(["PHOTO","VIDEO","EITHER"]).nullable().optional()
}).refine(x=>Boolean(x.taskId)||Boolean(x.adHocName),{message:"Each Schedule Task must use a Task Library item or an ad-hoc Task name."});

const schema=z.object({
 name:z.string().trim().min(2).max(500),
 documentReference:z.string().trim().max(150).nullable().optional(),
 documentRevision:z.string().trim().max(100).nullable().optional(),
 frequencyType:z.enum(["ONE_TIME","RECURRING"]),
 recurrenceUnit:z.enum(["MINUTE","HOUR","DAY","WEEK","MONTH","YEAR"]).nullable().optional(),
 recurrenceInterval:z.number().int().min(1).max(100000).nullable().optional(),
 recurrenceConfig:z.object({weekdays:z.array(z.number().int().min(0).max(6)).optional(),monthDays:z.array(z.number().int().min(1).max(31)).optional()}).nullable().optional(),
 startLocal:z.string(),
 endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
 timezone:z.string().min(1).max(100),
 workAreaId:z.string().min(1),
 reportedWorkItemId:z.string().min(1).nullable().optional(),
 tasks:z.array(scheduleTaskSchema).min(1)
});

function html(text:string|null|undefined){if(!text)return"<p></p>";const escaped=text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");return `<p>${escaped.replaceAll("\n","<br/>")}</p>`}

export async function POST(req:Request){
 try{
  const user=await requireUser();
  const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!membership||!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))return NextResponse.json({error:"Only an Admin or Property Manager can create Schedules."},{status:403});
  const input=schema.parse(await req.json());
  if(input.frequencyType==="RECURRING"&&(!input.recurrenceUnit||!input.recurrenceInterval))return NextResponse.json({error:"Recurring Schedules require a recurrence interval and unit."},{status:400});

  const workArea=await prisma.workArea.findUnique({where:{id:input.workAreaId},include:{property:true}});
  if(!workArea||workArea.property.organizationId!==membership.organizationId)return NextResponse.json({error:"Work Area not found in this Organization."},{status:404});
  if(workArea.status!=="ACTIVE"||workArea.property.status!=="ACTIVE")return NextResponse.json({error:"Schedules can only be created for active Work Areas under active Properties."},{status:409});
  if(!(await canAccessProperty(membership,workArea.propertyId)))return NextResponse.json({error:"Work Area not found in your assigned Properties."},{status:404});

  const reportedWorkItem=input.reportedWorkItemId?await prisma.reportedWorkItem.findFirst({where:{id:input.reportedWorkItemId,organizationId:membership.organizationId}}):null;
  if(input.reportedWorkItemId&&(!reportedWorkItem||reportedWorkItem.workAreaId!==workArea.id||reportedWorkItem.propertyId!==workArea.propertyId||reportedWorkItem.linkedScheduleId))return NextResponse.json({error:"Reported work item is unavailable or does not match this Work Area."},{status:409});

  const uniqueTaskIds=[...new Set(input.tasks.flatMap(x=>x.taskId?[x.taskId]:[]))];
  const validTasks=uniqueTaskIds.length?await prisma.task.findMany({where:{id:{in:uniqueTaskIds},organizationId:membership.organizationId,status:"ACTIVE"}}):[];
  if(validTasks.length!==uniqueTaskIds.length)return NextResponse.json({error:"Every selected Task must be active and belong to this Organization."},{status:409});

  const durations=input.tasks.map(x=>durationToMinutes(x.duration));
  const offsets=buildOffsets(durations);
  const startAt=zonedLocalToUtc(input.startLocal,input.timezone);
  const endDate=input.frequencyType==="RECURRING"&&input.endDate?new Date(`${input.endDate}T00:00:00.000Z`):null;
  if(endDate&&input.endDate!<input.startLocal.slice(0,10))return NextResponse.json({error:"Schedule End Date cannot be before the Start Date."},{status:400});

  const schedule=await prisma.$transaction(async tx=>{
   const created=await tx.schedule.create({data:{organizationId:membership.organizationId,name:input.name,documentReference:input.documentReference||null,documentRevision:input.documentRevision||null,frequencyType:input.frequencyType,recurrenceUnit:input.frequencyType==="RECURRING"?input.recurrenceUnit:null,recurrenceInterval:input.frequencyType==="RECURRING"?input.recurrenceInterval:null,recurrenceConfig:input.frequencyType==="RECURRING"&&input.recurrenceConfig?input.recurrenceConfig:Prisma.JsonNull,startAt,endDate,timezone:input.timezone,workAreaId:input.workAreaId,createdById:user.id}});
   const taskAudit:any[]=[];
   for(let i=0;i<input.tasks.length;i+=1){
    const item=input.tasks[i];
    let taskId=item.taskId??null;
    if(!taskId){
     const generated=await tx.task.create({data:{organizationId:membership.organizationId,name:item.adHocName!.trim(),descriptionHtml:html(item.adHocDescription),status:"ACTIVE",createdById:user.id,isAdHoc:!item.saveToLibrary}});
     taskId=generated.id;
     taskAudit.push({taskId:generated.id,name:generated.name,adHoc:true,savedToLibrary:Boolean(item.saveToLibrary)});
     if(item.saveToLibrary)await audit({organizationId:membership.organizationId,userId:user.id,action:"TASK_CREATED",entityType:"Task",entityId:generated.id,newValue:{name:generated.name,status:"ACTIVE",source:"AD_HOC_PROMOTED_DURING_SCHEDULE_CREATE"}},tx);
    }
    await tx.scheduleTask.create({data:{scheduleId:created.id,taskId,sequence:i+1,durationMinutes:offsets[i].durationMinutes,plannedStartOffsetMinutes:offsets[i].plannedStartOffsetMinutes,plannedEndOffsetMinutes:offsets[i].plannedEndOffsetMinutes,evidenceRule:item.evidenceRule,randomEveryN:item.evidenceRule==="RANDOM"?item.randomEveryN:null,randomEvidenceType:item.evidenceRule==="RANDOM"?item.randomEvidenceType:null}});
   }

   if(reportedWorkItem){
    await tx.reportedWorkItem.update({where:{id:reportedWorkItem.id},data:{status:"SCHEDULE_CREATED",linkedScheduleId:created.id,scheduleLinkedAt:new Date(),scheduleLinkedById:user.id}});
    await audit({organizationId:membership.organizationId,userId:user.id,action:"REPORTED_WORK_ITEM_SCHEDULE_LINKED",entityType:"ReportedWorkItem",entityId:reportedWorkItem.id,oldValue:{status:reportedWorkItem.status,dismissedAt:reportedWorkItem.dismissedAt?.toISOString()??null},newValue:{status:"SCHEDULE_CREATED",linkedScheduleId:created.id},metadata:{propertyId:reportedWorkItem.propertyId,workAreaId:reportedWorkItem.workAreaId}},tx);
   }

   await audit({organizationId:membership.organizationId,userId:user.id,action:"SCHEDULE_CREATED",entityType:"Schedule",entityId:created.id,newValue:{name:created.name,documentReference:created.documentReference,documentRevision:created.documentRevision,frequencyType:created.frequencyType,recurrenceUnit:created.recurrenceUnit,recurrenceInterval:created.recurrenceInterval,recurrenceConfig:input.recurrenceConfig??null,startAt:created.startAt.toISOString(),endDate:created.endDate?.toISOString().slice(0,10)??null,timezone:created.timezone,workAreaId:created.workAreaId,status:created.status,tasks:input.tasks.map((x,i)=>({taskId:x.taskId??null,adHocName:x.adHocName??null,saveToLibrary:x.saveToLibrary,durationMinutes:offsets[i].durationMinutes,evidenceRule:x.evidenceRule})),adHocTasksCreated:taskAudit}},tx);
   return created;
  });

  await reconcileScheduleOccurrences(schedule.id,{userId:user.id,reason:"edit"});
  return NextResponse.json({schedule});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to create Schedule."},{status:400})}
}
