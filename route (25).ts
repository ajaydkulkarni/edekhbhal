import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sha256, randomToken } from "@/lib/security";
import { audit } from "@/lib/audit";

export async function GET(req:Request){
  const token=new URL(req.url).searchParams.get("token");
  if(!token)return NextResponse.json({error:"Missing token"},{status:400});
  const rec=await prisma.magicLinkToken.findFirst({where:{tokenHash:sha256(token),usedAt:null,expiresAt:{gt:new Date()}},include:{user:{include:{memberships:true}}}});
  if(!rec)return NextResponse.json({error:"Invalid or expired authentication link"},{status:400});
  const sessionToken=randomToken(32);
  await prisma.$transaction(async tx=>{
    await tx.magicLinkToken.update({where:{id:rec.id},data:{usedAt:new Date()}});
    await tx.user.update({where:{id:rec.userId},data:{emailVerified:new Date()}});
    await tx.session.create({data:{userId:rec.userId,tokenHash:sha256(sessionToken),expiresAt:new Date(Date.now()+30*24*60*60*1000)}});
    await audit({userId:rec.userId,action:"LOGIN",metadata:{method:"magic_link"}},tx);
  });
  (await cookies()).set("edk_session",sessionToken,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:30*24*60*60});
  return NextResponse.redirect(new URL(rec.user.memberships.length?"/dashboard":"/onboarding",req.url));
}
