import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
export async function PATCH(req:Request){try{const user=await requireUser();const {name}=z.object({name:z.string().max(100)}).parse(await req.json());const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});const updated=await prisma.$transaction(async tx=>{const u=await tx.user.update({where:{id:user.id},data:{name:name||null}});await audit({organizationId:membership?.organizationId,userId:user.id,action:"PROFILE_UPDATED",entityType:"User",entityId:user.id,oldValue:{name:user.name},newValue:{name:u.name}},tx);return u});return NextResponse.json({user:updated})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to update profile"},{status:400})}}
