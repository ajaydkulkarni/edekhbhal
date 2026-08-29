import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {audit} from "@/lib/audit";
import {assignedPropertyIds} from "@/lib/propertyAccess";
import {personnelObjectExists,getPersonnelObjectInfo} from "@/lib/personnelStorage";
const schema=z.object({storagePath:z.string().min(1),mimeType:z.enum(["image/jpeg","image/png","image/webp"]),sizeBytes:z.number().int().positive().max(8000000)});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser();const actor=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!actor||!["ADMIN","PROPERTY_MANAGER"].includes(actor.role))return NextResponse.json({error:"Permission denied"},{status:403});
  const{id}=await params;const target=await prisma.organizationMember.findFirst({where:{id,organizationId:actor.organizationId},include:{propertyAssignments:true}});
  if(!target)return NextResponse.json({error:"Team member not found"},{status:404});
  if(actor.role==="PROPERTY_MANAGER"){const scope=await assignedPropertyIds(actor);if(target.role!=="USER"||!target.propertyAssignments.some(x=>scope?.includes(x.propertyId)))return NextResponse.json({error:"Permission denied"},{status:403});}
  const data=schema.parse(await req.json());const prefix=`personnel/${actor.organizationId}/${id}/photo/`;
  if(!data.storagePath.startsWith(prefix))return NextResponse.json({error:"Invalid storage path"},{status:400});
  if(!await personnelObjectExists(data.storagePath))return NextResponse.json({error:"Uploaded file was not found"},{status:400});
  const info=await getPersonnelObjectInfo(data.storagePath);if(info.size>8000000)return NextResponse.json({error:"Profile photo is too large"},{status:400});
  await prisma.$transaction(async tx=>{await tx.organizationMember.update({where:{id},data:{photoStoragePath:data.storagePath}});await audit({organizationId:actor.organizationId,userId:user.id,action:"USER_UPDATED",entityType:"OrganizationMemberPhoto",entityId:id,newValue:{photoUpdated:true}},tx)});
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to confirm photo"},{status:400})}
}
