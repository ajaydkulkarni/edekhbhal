import {NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {requireUser} from "@/lib/session";
import {canAccessProperty} from "@/lib/propertyAccess";
import {audit} from "@/lib/audit";

export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser();
  const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!membership||!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))return NextResponse.json({error:"Only an Admin or Property Manager can action reported work."},{status:403});
  const{id}=await params;
  const item=await prisma.reportedWorkItem.findFirst({where:{id,organizationId:membership.organizationId}});
  if(!item||!(await canAccessProperty(membership,item.propertyId)))return NextResponse.json({error:"Reported work item not found."},{status:404});
  if(item.linkedScheduleId||item.status==="SCHEDULE_CREATED")return NextResponse.json({error:"A Schedule has already been created for this reported work item."},{status:409});
  if(item.status==="DISMISSED")return NextResponse.json({item});
  const updated=await prisma.$transaction(async tx=>{
    const saved=await tx.reportedWorkItem.update({where:{id:item.id},data:{status:"DISMISSED",dismissedAt:new Date(),dismissedById:user.id}});
    await audit({organizationId:membership.organizationId,userId:user.id,action:"REPORTED_WORK_ITEM_DISMISSED",entityType:"ReportedWorkItem",entityId:item.id,oldValue:{status:item.status},newValue:{status:saved.status,dismissedAt:saved.dismissedAt?.toISOString()??null},metadata:{propertyId:item.propertyId,workAreaId:item.workAreaId}},tx);
    return saved;
  });
  return NextResponse.json({item:updated});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to dismiss reported work."},{status:400});}
}
