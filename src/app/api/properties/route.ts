import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { audit } from "@/lib/audit";
const schema=z.object({organizationId:z.string(),name:z.string().min(2),addressLine1:z.string().optional(),addressLine2:z.string().optional(),addressLine3:z.string().optional(),city:z.string().optional(),state:z.string().optional(),postalCode:z.string().optional(),country:z.string().optional(),timezone:z.string().optional()});
export async function POST(req:Request){try{const data=schema.parse(await req.json());const {user,membership}=await requireMembership(data.organizationId);if(!['ADMIN','PROPERTY_MANAGER'].includes(membership.role))return NextResponse.json({error:'Permission denied'},{status:403});const p=await prisma.$transaction(async tx=>{const property=await tx.property.create({data});await audit({organizationId:data.organizationId,userId:user.id,action:'PROPERTY_CREATED',entityType:'Property',entityId:property.id,newValue:data as any},tx);return property;});return NextResponse.json({property:p});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create property'},{status:400});}}
