import {ActionType} from "@prisma/client";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {audit} from "@/lib/audit";
import {requireMobileMembership,mobileErrorResponse,MobileApiError} from "@/lib/mobileAuth";
const schema=z.object({note:z.string().trim().min(1).max(4000)});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const{id}=await params;const{user,membership}=await requireMobileMembership(req);const input=schema.parse(await req.json());
  const occurrence=await prisma.scheduleOccurrence.findFirst({where:{id,organizationId:membership.organizationId,assignedUserId:user.id,status:"IN_PROGRESS"},include:{workArea:{select:{propertyId:true}}}});
  if(!occurrence)throw new MobileApiError(404,"NOT_FOUND","Active Schedule work not found.");
  const created=await prisma.$transaction(async tx=>{
   const note=await tx.scheduleOccurrenceNote.create({data:{occurrenceId:occurrence.id,occurrenceTaskId:null,scope:"SCHEDULE",note:input.note,createdById:user.id}});
   const reported=await tx.reportedWorkItem.create({data:{organizationId:membership.organizationId,propertyId:occurrence.workArea.propertyId,workAreaId:occurrence.workAreaId,sourceNoteId:note.id,noteScope:"SCHEDULE",noteText:input.note,sourceScheduleName:occurrence.scheduleNameSnapshot,reportedById:user.id,reportedAt:note.createdAt}});
   await audit({organizationId:membership.organizationId,userId:user.id,action:ActionType.SCHEDULE_NOTE_ADDED,entityType:"ScheduleOccurrenceNote",entityId:note.id,metadata:{occurrenceId:occurrence.id,scheduleName:occurrence.scheduleNameSnapshot,noteLength:input.note.length,reportedWorkItemId:reported.id}},tx);
   await audit({organizationId:membership.organizationId,userId:user.id,action:"REPORTED_WORK_ITEM_CREATED",entityType:"ReportedWorkItem",entityId:reported.id,metadata:{sourceNoteId:note.id,noteScope:"SCHEDULE",propertyId:reported.propertyId,workAreaId:reported.workAreaId}},tx);
   return{note,reported};
  });
  return Response.json({note:{id:created.note.id,note:created.note.note,createdAt:created.note.createdAt.toISOString()},reportedWorkItemId:created.reported.id});
 }catch(error){return mobileErrorResponse(error);}
}
