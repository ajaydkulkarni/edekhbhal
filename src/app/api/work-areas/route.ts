import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";
import { makeQrSeed, renderQrDataUrl } from "@/lib/qr";

const schema=z.object({propertyId:z.string(),name:z.string().min(2),description:z.string().optional(),locationIdentifier:z.string().optional()});
export async function POST(req:Request){
  try{
    const data=schema.parse(await req.json());
    const property=await prisma.property.findUnique({where:{id:data.propertyId}});
    if(!property)return NextResponse.json({error:"Property not found"},{status:404});
    const {user,membership}=await requireMembership(property.organizationId);
    if(!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))return NextResponse.json({error:"Permission denied"},{status:403});
    const created=await prisma.$transaction(async tx=>{
      const wa=await tx.workArea.create({data});
      const seed=makeQrSeed();
      const qr=await tx.qrCode.create({data:{workAreaId:wa.id,tokenHash:seed.hash,tokenPreview:seed.preview,generatedById:user.id}});
      await audit({organizationId:property.organizationId,userId:user.id,action:"WORK_AREA_CREATED",entityType:"WorkArea",entityId:wa.id,newValue:data as any},tx);
      await audit({organizationId:property.organizationId,userId:user.id,action:"QR_GENERATED",entityType:"WorkArea",entityId:wa.id,newValue:{qrId:qr.id,tokenPreview:qr.tokenPreview}},tx);
      return {wa,qr};
    });
    return NextResponse.json({workArea:created.wa,qr:{id:created.qr.id,dataUrl:await renderQrDataUrl(created.qr.id),tokenPreview:created.qr.tokenPreview}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to create work area"},{status:400})}
}
