import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function Dashboard(){
  const user=await getSessionUser(); if(!user)redirect("/login");
  const m=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});
  if(!m)redirect("/onboarding");
  const [properties,workAreas,users]=await Promise.all([
    prisma.property.count({where:{organizationId:m.organizationId}}),
    prisma.workArea.count({where:{property:{organizationId:m.organizationId}}}),
    prisma.organizationMember.count({where:{organizationId:m.organizationId,status:"ACTIVE"}})
  ]);
  return <><Nav/><main className="container"><h1>Welcome to {m.organization.name}</h1><p className="muted">Signed in as {user.email} · {m.role}</p>
    <div className="statGrid"><div className="stat"><div className="n">{properties}</div>Properties</div><div className="stat"><div className="n">{workAreas}</div>Work Areas</div><div className="stat"><div className="n">{users}</div>Users</div></div>
  </main></>;
}
