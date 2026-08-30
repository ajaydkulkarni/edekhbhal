import {ActionType} from "@prisma/client";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {audit} from "@/lib/audit";
import {requireMobileMembership,mobileErrorResponse,MobileApiError} from "@/lib/mobileAuth";
const schema=z.object({note:z.string().trim().min(1).max(4000)});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const{id}=await params;const{user,membership}=await requireMobileMembership(req);const input=schema.parse(await req.json());
  const task=await prisma.scheduleOccurrenceTask.findFirst({where:{id,status:"IN_PROGRESS",occurrence:{organizationId:membership.organizationId,assignedUserId:user.id,status:"IN_PROGRESS"}},include:{occurrence:{include:{workArea:{select:{propertyId:true}}}}}});
  if(!task)throw new MobileApiError(404,"NOT_FOUND","Active Task not found.");
  const created=await prisma.$transaction(async tx=>{
   const note=await tx.scheduleOccurrenceNote.create({data:{occurrenceId:task.occurrenceId,occurrenceTaskId:task.id,scope:"TASK",note:input.note,createdById:user.id}});
   const reported=await tx.reportedWorkItem.create({data:{organizationId:membership.organizationId,propertyId:task.occurrence.workArea.propertyId,workAreaId:task.occurrence.workAreaId,sourceNoteId:note.id,noteScope:"TASK",noteText:input.note,sourceTaskName:task.taskNameSnapshot,sourceScheduleName:task.occurrence.scheduleNameSnapshot,reportedById:user.id,reportedAt:note.createdAt}});
   await audit({organizationId:membership.organizationId,userId:user.id,action:ActionType.TASK_NOTE_ADDED,entityType:"ScheduleOccurrenceNote",entityId:note.id,metadata:{occurrenceId:task.occurrenceId,occurrenceTaskId:task.id,taskName:task.taskNameSnapshot,noteLength:input.note.length,reportedWorkItemId:reported.id}},tx);
   await audit({organizationId:membership.organizationId,userId:user.id,action:"REPORTED_WORK_ITEM_CREATED",entityType:"ReportedWorkItem",entityId:reported.id,metadata:{sourceNoteId:note.id,noteScope:"TASK",propertyId:reported.propertyId,workAreaId:reported.workAreaId}},tx);
   return{note,reported};
  });
  return Response.json({note:{id:created.note.id,note:created.note.note,createdAt:created.note.createdAt.toISOString()},reportedWorkItemId:created.reported.id});
 }catch(error){return mobileErrorResponse(error);}
}
