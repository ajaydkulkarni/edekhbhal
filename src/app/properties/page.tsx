import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PropertyManager } from "@/components/PropertyManager";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function Properties(){
  const user=await getSessionUser(); if(!user)redirect("/login");
  const m=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});
  if(!m)redirect("/onboarding");
  const properties=await prisma.property.findMany({where:{organizationId:m.organizationId},include:{_count:{select:{workAreas:true}}},orderBy:{name:"asc"}});
  const canManage=["ADMIN","PROPERTY_MANAGER"].includes(m.role);
  return <><Nav/><main className="container">
    <div className="row"><div style={{marginRight:"auto"}}><h1>Properties</h1><p className="muted">{m.organization.name}</p></div>{canManage&&<PropertyManager organizationId={m.organizationId} defaultTimezone={m.organization.timezone} organizationAddress={m.organization}/>}</div>
    <div className="card"><table className="table"><thead><tr><th>Name</th><th>City</th><th>Status</th><th>Work Areas</th><th></th></tr></thead><tbody>
      {properties.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.city||"—"}</td><td>{p.status}</td><td>{p._count.workAreas}</td><td><Link className="button small secondary" href={`/properties/${p.id}`}>Open</Link></td></tr>)}
      {!properties.length&&<tr><td colSpan={5} className="muted">No properties yet.</td></tr>}
    </tbody></table></div>
  </main></>;
}
