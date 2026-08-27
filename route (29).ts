import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";
import { makeQrSeed, renderQrDataUrl } from "@/lib/qr";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const wa=await prisma.workArea.findUnique({where:{id},include:{property:true,qrCodes:{where:{status:"ACTIVE"},orderBy:{generatedAt:"desc"}}}});
    if(!wa)return NextResponse.json({error:"Work area not found"},{status:404});
    const {user,membership}=await requireMembership(wa.property.organizationId);
    if(!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))return NextResponse.json({error:"Permission denied"},{status:403});
    const seed=makeQrSeed();
    const qr=await prisma.$transaction(async tx=>{
      const old=wa.qrCodes[0]??null;
      if(wa.qrCodes.length)await tx.qrCode.updateMany({where:{workAreaId:id,status:"ACTIVE"},data:{status:"REVOKED",revokedAt:new Date(),revokedById:user.id}});
      const created=await tx.qrCode.create({data:{workAreaId:id,tokenHash:seed.hash,tokenPreview:seed.preview,generatedById:user.id}});
      await audit({organizationId:wa.property.organizationId,userId:user.id,action:"QR_REGENERATED",entityType:"WorkArea",entityId:id,oldValue:old?{qrId:old.id,tokenPreview:old.tokenPreview}:null,newValue:{qrId:created.id,tokenPreview:created.tokenPreview}},tx);
      return created;
    });
    return NextResponse.json({qr:{id:qr.id,dataUrl:await renderQrDataUrl(qr.id),tokenPreview:qr.tokenPreview}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to regenerate QR"},{status:400})}
}
