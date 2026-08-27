import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/security";

const schema=z.object({email:z.string().email().transform(v=>v.toLowerCase().trim())});
export async function POST(req:Request){
  try{
    const parsed=schema.safeParse(await req.json());
    if(!parsed.success)return NextResponse.json({error:"Please enter a valid email address."},{status:400});
    const user=await prisma.user.upsert({where:{email:parsed.data.email},update:{},create:{email:parsed.data.email}});
    const raw=randomToken(32);
    await prisma.magicLinkToken.create({data:{userId:user.id,tokenHash:sha256(raw),expiresAt:new Date(Date.now()+15*60*1000)}});
    await audit({userId:user.id,action:"MAGIC_LINK_REQUESTED",metadata:{email:user.email}});
    const link=`${process.env.APP_URL??"http://localhost:3000"}/api/auth/verify?token=${raw}`;
    return NextResponse.json({message:"Authentication link created. Email delivery is not connected yet, so use the development link below.",devLink:link});
  }catch(e){console.error("request-link failed",e);return NextResponse.json({error:e instanceof Error?e.message:"Unable to create link"},{status:500})}
}
