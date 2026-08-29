import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {assignedPropertyIds} from "@/lib/propertyAccess";
import {createPersonnelSignedUpload} from "@/lib/personnelStorage";
const schema=z.object({fileName:z.string().min(1).max(255),mimeType:z.string().min(1).max(150),sizeBytes:z.number().int().positive().max(15000000)});
const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser();const actor=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!actor||!["ADMIN","PROPERTY_MANAGER"].includes(actor.role))return NextResponse.json({error:"Permission denied"},{status:403});
  const{id}=await params;const target=await prisma.organizationMember.findFirst({where:{id,organizationId:actor.organizationId},include:{propertyAssignments:true}});
  if(!target)return NextResponse.json({error:"Team member not found"},{status:404});
  if(actor.role==="PROPERTY_MANAGER"){const scope=await assignedPropertyIds(actor);if(target.role!=="USER"||!target.propertyAssignments.some(x=>scope?.includes(x.propertyId)))return NextResponse.json({error:"Permission denied"},{status:403});}
  const data=schema.parse(await req.json());if(!allowed.has(data.mimeType))return NextResponse.json({error:"Unsupported document type"},{status:400});
  const safe=data.fileName.replace(/[^a-zA-Z0-9._-]+/g,"_").slice(-120);const path=`personnel/${actor.organizationId}/${id}/documents/${crypto.randomUUID()}-${safe}`;
  return NextResponse.json({...await createPersonnelSignedUpload(path),maxSizeBytes:15000000});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to prepare document upload"},{status:400})}
}
