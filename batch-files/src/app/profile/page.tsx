import Link from "next/link";
import {redirect} from "next/navigation";
import {Nav} from "@/components/Nav";
import {ProfileForm} from "@/components/ProfileForm";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";

export default async function ProfilePage(){
 const user=await getSessionUser();if(!user)redirect("/login");
 const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{propertyAssignments:{include:{property:true}},personnelDocuments:{select:{id:true}}}});
 if(!membership)redirect("/onboarding");
 return <><Nav/><main className="container" style={{maxWidth:900}}>
  <h1>My Profile</h1>
  <div className="card" style={{marginBottom:18}}><ProfileForm user={user}/></div>
  <div className="card">
   <h2 style={{marginTop:0}}>Personnel Profile</h2>
   <p><strong>Role:</strong> {membership.role.replace("PROPERTY_MANAGER","Property Manager")}</p>
   <p><strong>Mobile:</strong> {membership.mobilePhone||"—"}</p>
   <p><strong>Assigned Properties:</strong> {membership.role==="ADMIN"?"All Properties":membership.propertyAssignments.length?membership.propertyAssignments.map(a=>a.property.name).join(", "):"None"}</p>
   <p><strong>Verification Documents:</strong> {membership.personnelDocuments.length}</p>
   <p className="muted">Internal management Notes are not shown on self-service profiles.</p>
   <Link className="button secondary" href={`/team/${membership.id}`}>View Full Self-Service Profile</Link>
  </div>
 </main></>;
}
