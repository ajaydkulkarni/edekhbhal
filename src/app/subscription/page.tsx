import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function SubscriptionPage(){
  const user=await getSessionUser(); if(!user)redirect("/login");
  const m=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!m)redirect("/onboarding");
  const sub=await prisma.subscription.findUnique({where:{organizationId:m.organizationId},include:{plan:true}});
  return <><Nav/><main className="container"><h1>Subscription</h1><div className="card">{sub?<><h2>{sub.plan.name}</h2><p>Status: {sub.status}</p><p className="muted">Properties limit: {sub.plan.maxProperties??"Unlimited"} · Work Areas limit: {sub.plan.maxWorkAreas??"Unlimited"} · Users limit: {sub.plan.maxUsers??"Unlimited"}</p></>:<p>No subscription assigned.</p>}</div></main></>;
}
