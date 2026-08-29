import Link from "next/link";
import {redirect} from "next/navigation";
import {Nav} from "@/components/Nav";
import {PropertyManager} from "@/components/PropertyManager";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {assignedPropertyIds} from "@/lib/propertyAccess";

export default async function Properties(){
 const user=await getSessionUser();if(!user)redirect("/login");
 const m=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});
 if(!m)redirect("/onboarding");
 const scope=await assignedPropertyIds(m);
 const properties=await prisma.property.findMany({
  where:{organizationId:m.organizationId,...(scope===null?{}:{id:{in:scope}})},
  include:{_count:{select:{workAreas:true}},memberAssignments:{include:{member:true}}},
  orderBy:{name:"asc"}
 });
 return <><Nav/><main className="container">
  <div className="row"><div style={{marginRight:"auto"}}><h1>Properties</h1><p className="muted">{m.organization.name}</p></div>{m.role==="ADMIN"&&<PropertyManager organizationId={m.organizationId} defaultTimezone={m.organization.timezone} organizationAddress={m.organization}/>}</div>
  <div className="card" style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Name</th><th>City</th><th>Status</th><th>Work Areas</th><th>Property Managers</th><th>Users</th><th></th></tr></thead><tbody>
   {properties.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.city||"—"}</td><td>{p.status}</td><td>{p._count.workAreas}</td><td>{p.memberAssignments.filter(a=>a.member.role==="PROPERTY_MANAGER").length}</td><td>{p.memberAssignments.filter(a=>a.member.role==="USER").length}</td><td><Link className="button small secondary" href={`/properties/${p.id}`}>Open</Link></td></tr>)}
   {!properties.length&&<tr><td colSpan={7} className="muted">No Properties are assigned or available.</td></tr>}
  </tbody></table></div>
 </main></>;
}
