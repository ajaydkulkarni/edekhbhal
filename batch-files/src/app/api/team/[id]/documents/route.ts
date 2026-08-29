import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {audit} from "@/lib/audit";
import {assignedPropertyIds} from "@/lib/propertyAccess";
import {personnelObjectExists,getPersonnelObjectInfo} from "@/lib/personnelStorage";
const schema=z.object({storagePath:z.string().min(1),fileName:z.string().min(1).max(255),mimeType:z.string().min(1).max(150),sizeBytes:z.number().int().positive().max(15000000),documentType:z.string().min(1).max(100),description:z.string().min(1).max(500),expiryDate:z.string().nullable().optional()});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser();const actor=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!actor||!["ADMIN","PROPERTY_MANAGER"].includes(actor.role))return NextResponse.json({error:"Permission denied"},{status:403});
  const{id}=await params;const target=await prisma.organizationMember.findFirst({where:{id,organizationId:actor.organizationId},include:{propertyAssignments:true}});
  if(!target)return NextResponse.json({error:"Team member not found"},{status:404});
  if(actor.role==="PROPERTY_MANAGER"){const scope=await assignedPropertyIds(actor);if(target.role!=="USER"||!target.propertyAssignments.some(x=>scope?.includes(x.propertyId)))return NextResponse.json({error:"Permission denied"},{status:403});}
  const data=schema.parse(await req.json());const prefix=`personnel/${actor.organizationId}/${id}/documents/`;
  if(!data.storagePath.startsWith(prefix))return NextResponse.json({error:"Invalid storage path"},{status:400});
  if(!await personnelObjectExists(data.storagePath))return NextResponse.json({error:"Uploaded file was not found"},{status:400});
  const info=await getPersonnelObjectInfo(data.storagePath);if(info.size>15000000)return NextResponse.json({error:"Document is too large"},{status:400});
  const doc=await prisma.$transaction(async tx=>{
    const d=await tx.personnelDocument.create({data:{organizationMemberId:id,documentType:data.documentType,description:data.description,fileName:data.fileName,mimeType:data.mimeType,sizeBytes:info.size,storagePath:data.storagePath,expiryDate:data.expiryDate?new Date(`${data.expiryDate}T00:00:00Z`):null,uploadedById:user.id}});
    await audit({organizationId:actor.organizationId,userId:user.id,action:"USER_UPDATED",entityType:"PersonnelDocument",entityId:d.id,newValue:{organizationMemberId:id,documentType:data.documentType,description:data.description,fileName:data.fileName}},tx);return d;
  });return NextResponse.json({document:doc});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to save document"},{status:400})}
}
