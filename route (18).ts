import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

const schema=z.object({name:z.string().min(2),logoUrl:z.string().optional(),addressLine1:z.string().optional(),addressLine2:z.string().optional(),addressLine3:z.string().optional(),city:z.string().optional(),state:z.string().optional(),postalCode:z.string().optional(),country:z.string().optional(),timezone:z.string().min(1)});
export async function POST(req:Request){
  try{
    const user=await requireUser();
    if((await prisma.organizationMember.count({where:{userId:user.id}}))>0)return NextResponse.json({error:"User already belongs to an organization"},{status:409});
    const data=schema.parse(await req.json());
    const org=await prisma.$transaction(async tx=>{
      const o=await tx.organization.create({data});
      await tx.organizationMember.create({data:{organizationId:o.id,userId:user.id,role:"ADMIN"}});
      const starter=await tx.plan.findUnique({where:{code:"STARTER"}});
      if(starter)await tx.subscription.create({data:{organizationId:o.id,planId:starter.id,status:"TRIALING"}});
      await audit({organizationId:o.id,userId:user.id,action:"ORGANIZATION_CREATED",entityType:"Organization",entityId:o.id,newValue:data as any},tx);
      return o;
    });
    return NextResponse.json({organization:org});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to create organization"},{status:400})}
}
