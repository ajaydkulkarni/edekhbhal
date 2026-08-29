import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TeamManager } from "@/components/TeamManager";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { assignedPropertyIds } from "@/lib/propertyAccess";

export default async function TeamPage(){
  const user=await getSessionUser(); if(!user)redirect("/login");
  const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!membership)redirect("/onboarding");
  if(!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))redirect("/profile");

  const scopeIds=await assignedPropertyIds(membership);
  const properties=await prisma.property.findMany({
    where:{organizationId:membership.organizationId,...(scopeIds===null?{}:{id:{in:scopeIds}})},
    orderBy:{name:"asc"},select:{id:true,name:true,status:true}
  });
  const members=await prisma.organizationMember.findMany({
    where:{
      organizationId:membership.organizationId,
      ...(membership.role==="PROPERTY_MANAGER"?{
        role:"USER",
        propertyAssignments:{some:{propertyId:{in:scopeIds??[]}}}
      }:{})
    },
    include:{user:true,propertyAssignments:{include:{property:{select:{id:true,name:true}}}}},
    orderBy:{createdAt:"asc"}
  });

  return <><Nav/><main className="container">
    <div className="row">
      <div style={{marginRight:"auto"}}><h1>Team / Personnel</h1><p className="muted">Personnel profiles, roles and Property assignments.</p></div>
      <Link className="button secondary" href="/profile">My Profile</Link>
    </div>
    <TeamManager members={members as any} properties={properties} actorRole={membership.role} currentUserId={user.id}/>
  </main></>;
}
