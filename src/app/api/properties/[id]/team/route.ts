import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {audit} from "@/lib/audit";
const schema=z.object({memberIds:z.array(z.string()).default([])});
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await requireUser();const admin=await prisma.organizationMember.findFirst({where:{userId:actor.id,status:"ACTIVE",role:"ADMIN"}});
  if(!admin)return NextResponse.json({error:"Permission denied"},{status:403});
  const{id:propertyId}=await params;const property=await prisma.property.findFirst({where:{id:propertyId,organizationId:admin.organizationId}});
  if(!property)return NextResponse.json({error:"Property not found"},{status:404});
  const data=schema.parse(await req.json());const memberIds=[...new Set(data.memberIds)];
  if(memberIds.length){const members=await prisma.organizationMember.findMany({where:{id:{in:memberIds},organizationId:admin.organizationId,role:{in:["PROPERTY_MANAGER","USER"]}},select:{id:true}});if(members.length!==memberIds.length)return NextResponse.json({error:"One or more team members are invalid for this Property."},{status:400});}
  const old=await prisma.organizationMemberProperty.findMany({where:{propertyId},select:{organizationMemberId:true}});const oldIds=old.map(x=>x.organizationMemberId);
  await prisma.$transaction(async tx=>{
    await tx.organizationMemberProperty.deleteMany({where:{propertyId,organizationMemberId:{notIn:memberIds}}});
    const toAdd=memberIds.filter(id=>!oldIds.includes(id));if(toAdd.length)await tx.organizationMemberProperty.createMany({data:toAdd.map(organizationMemberId=>({organizationMemberId,propertyId,assignedById:actor.id}))});
    await audit({organizationId:admin.organizationId,userId:actor.id,action:"PROPERTY_UPDATED",entityType:"PropertyTeamAssignments",entityId:propertyId,oldValue:{memberIds:oldIds},newValue:{memberIds}},tx);
  });
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to save Property team"},{status:400})}
}
