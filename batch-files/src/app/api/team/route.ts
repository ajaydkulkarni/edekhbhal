import {NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {requireUser} from "@/lib/session";
import {audit} from "@/lib/audit";
import {assignedPropertyIds} from "@/lib/propertyAccess";

const schema=z.object({
  email:z.string().email().transform(v=>v.toLowerCase().trim()),
  name:z.string().min(2).max(200),
  role:z.enum(["ADMIN","PROPERTY_MANAGER","USER"]),
  mobilePhone:z.string().max(50).optional(),
  propertyIds:z.array(z.string()).default([])
});

export async function POST(req:Request){
  try{
    const actor=await requireUser();
    const membership=await prisma.organizationMember.findFirst({where:{userId:actor.id,status:"ACTIVE"}});
    if(!membership||!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))return NextResponse.json({error:"Permission denied"},{status:403});
    const data=schema.parse(await req.json());
    if(membership.role==="PROPERTY_MANAGER"&&data.role!=="USER")return NextResponse.json({error:"Property Managers may add User-role team members only."},{status:403});

    let propertyIds=data.propertyIds;
    if(membership.role==="PROPERTY_MANAGER")propertyIds=(await assignedPropertyIds(membership))??[];
    if(data.role==="ADMIN")propertyIds=[];

    if(membership.role==="ADMIN"&&propertyIds.length){
      const count=await prisma.property.count({where:{organizationId:membership.organizationId,id:{in:propertyIds}}});
      if(count!==new Set(propertyIds).size)return NextResponse.json({error:"One or more selected Properties are invalid."},{status:400});
    }

    const member=await prisma.$transaction(async tx=>{
      const user=await tx.user.upsert({where:{email:data.email},update:{active:true,name:data.name},create:{email:data.email,name:data.name}});
      const result=await tx.organizationMember.upsert({
        where:{organizationId_userId:{organizationId:membership.organizationId,userId:user.id}},
        update:{role:data.role,status:"ACTIVE",mobilePhone:data.mobilePhone||null},
        create:{organizationId:membership.organizationId,userId:user.id,role:data.role,status:"ACTIVE",mobilePhone:data.mobilePhone||null}
      });
      await tx.organizationMemberProperty.deleteMany({where:{organizationMemberId:result.id}});
      if(propertyIds.length&&data.role!=="ADMIN")await tx.organizationMemberProperty.createMany({data:[...new Set(propertyIds)].map(propertyId=>({organizationMemberId:result.id,propertyId,assignedById:actor.id}))});
      await audit({organizationId:membership.organizationId,userId:actor.id,action:"USER_INVITED",entityType:"OrganizationMember",entityId:result.id,newValue:{email:user.email,name:user.name,role:result.role,status:result.status,propertyIds}},tx);
      return result;
    });
    return NextResponse.json({member});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to add user"},{status:400})}
}
