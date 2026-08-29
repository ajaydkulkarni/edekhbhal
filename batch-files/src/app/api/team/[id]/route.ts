import {NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {requireUser} from "@/lib/session";
import {audit} from "@/lib/audit";
import {assignedPropertyIds} from "@/lib/propertyAccess";

const schema=z.object({
 role:z.enum(["ADMIN","PROPERTY_MANAGER","USER"]).optional(),status:z.enum(["ACTIVE","INACTIVE"]).optional(),
 name:z.string().min(2).max(200).optional(),addressLine1:z.string().max(255).optional(),addressLine2:z.string().max(255).optional(),addressLine3:z.string().max(255).optional(),
 city:z.string().max(150).optional(),state:z.string().max(150).optional(),postalCode:z.string().max(30).optional(),country:z.string().max(100).optional(),
 mobilePhone:z.string().max(50).optional(),residencePhone:z.string().max(50).optional(),alternatePhone:z.string().max(50).optional(),notes:z.string().max(10000).optional(),
 propertyIds:z.array(z.string()).optional()
});
const nullable=(v:string|undefined)=>v===undefined?undefined:v.trim()||null;

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await requireUser();
  const current=await prisma.organizationMember.findFirst({where:{userId:actor.id,status:"ACTIVE"}});
  if(!current||!["ADMIN","PROPERTY_MANAGER"].includes(current.role))return NextResponse.json({error:"Permission denied"},{status:403});
  const{id}=await params;
  const old=await prisma.organizationMember.findFirst({where:{id,organizationId:current.organizationId},include:{user:true,propertyAssignments:true}});
  if(!old)return NextResponse.json({error:"User not found"},{status:404});
  const data=schema.parse(await req.json());

  if(current.role==="PROPERTY_MANAGER"){
    const scope=await assignedPropertyIds(current);
    if(old.role!=="USER"||!old.propertyAssignments.some(a=>scope?.includes(a.propertyId)))return NextResponse.json({error:"Permission denied"},{status:403});
    if(data.role!==undefined||data.status!==undefined||data.propertyIds!==undefined)return NextResponse.json({error:"Property Managers cannot change Role, Status or Property assignments."},{status:403});
  }
  if(current.role==="ADMIN"&&old.userId===actor.id&&(data.role!==undefined||data.status!==undefined))return NextResponse.json({error:"You cannot change your own role or status here."},{status:409});
  if(data.propertyIds?.length){
    const count=await prisma.property.count({where:{organizationId:current.organizationId,id:{in:data.propertyIds}}});
    if(count!==new Set(data.propertyIds).size)return NextResponse.json({error:"One or more selected Properties are invalid."},{status:400});
  }

  const updated=await prisma.$transaction(async tx=>{
    if(data.name!==undefined)await tx.user.update({where:{id:old.userId},data:{name:data.name}});
    const member=await tx.organizationMember.update({where:{id},data:{
      ...(data.role!==undefined?{role:data.role}:{}),...(data.status!==undefined?{status:data.status}:{}),
      addressLine1:nullable(data.addressLine1),addressLine2:nullable(data.addressLine2),addressLine3:nullable(data.addressLine3),
      city:nullable(data.city),state:nullable(data.state),postalCode:nullable(data.postalCode),country:nullable(data.country),
      mobilePhone:nullable(data.mobilePhone),residencePhone:nullable(data.residencePhone),alternatePhone:nullable(data.alternatePhone),
      ...(data.notes!==undefined?{notes:nullable(data.notes)}:{})
    }});
    if(data.propertyIds!==undefined){
      const newIds=data.role==="ADMIN"?[]:[...new Set(data.propertyIds)];
      const oldIds=old.propertyAssignments.map(x=>x.propertyId);
      await tx.organizationMemberProperty.deleteMany({where:{organizationMemberId:id,propertyId:{notIn:newIds}}});
      const toAdd=newIds.filter(propertyId=>!oldIds.includes(propertyId));
      if(toAdd.length)await tx.organizationMemberProperty.createMany({data:toAdd.map(propertyId=>({organizationMemberId:id,propertyId,assignedById:actor.id}))});
    }
    const action=data.role&&data.role!==old.role?"ROLE_CHANGED":data.status==="INACTIVE"?"USER_DEACTIVATED":"USER_UPDATED";
    await audit({organizationId:current.organizationId,userId:actor.id,action,entityType:"OrganizationMember",entityId:id,oldValue:{role:old.role,status:old.status,name:old.user.name,propertyIds:old.propertyAssignments.map(x=>x.propertyId)},newValue:{...data,notes:data.notes!==undefined?"[internal notes updated]":undefined}},tx);
    return member;
  });
  return NextResponse.json({member:updated});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to update user"},{status:400})}
}
