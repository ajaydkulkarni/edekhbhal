import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {Nav} from "@/components/Nav";
import {WorkAreaManager} from "@/components/WorkAreaManager";
import {PropertyEditor} from "@/components/PropertyEditor";
import {WorkingHoursEditor} from "@/components/WorkingHoursEditor";
import {PropertyTeamAssignments} from "@/components/PropertyTeamAssignments";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {canAccessProperty} from "@/lib/propertyAccess";

export default async function PropertyDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
 const{id}=await params;const{tab="details"}=await searchParams;const user=await getSessionUser();if(!user)redirect("/login");
 const property=await prisma.property.findUnique({where:{id},include:{
  organization:true,
  workAreas:{include:{qrCodes:{where:{status:"ACTIVE"},orderBy:{generatedAt:"desc"},take:1}},orderBy:{name:"asc"}},
  memberAssignments:{include:{member:{include:{user:true}}},orderBy:{assignedAt:"asc"}}
 }});
 if(!property)notFound();
 const m=await prisma.organizationMember.findUnique({where:{organizationId_userId:{organizationId:property.organizationId,userId:user.id}}});
 if(!m||m.status!=="ACTIVE"||!await canAccessProperty(m,property.id))notFound();
 const workAreas=property.workAreas.map(w=>({...w,qrCodes:w.qrCodes.map(q=>({...q,generatedAt:q.generatedAt.toISOString()}))}));
 const canEditProperty=m.role==="ADMIN";const canManageOps=["ADMIN","PROPERTY_MANAGER"].includes(m.role);
 const eligible=m.role==="ADMIN"?await prisma.organizationMember.findMany({where:{organizationId:property.organizationId,status:{in:["ACTIVE","INACTIVE"]},role:{in:["PROPERTY_MANAGER","USER"]}},include:{user:true},orderBy:{createdAt:"asc"}}):[];
 const tabs=[["details","Property Details"],["work-areas","Work Areas"],["team","Team Assignments"]];
 return <><Nav/><main className="container">
  <div className="breadcrumbs"><Link href="/properties">Properties</Link> / {property.name}</div><h1>{property.name}</h1><p className="muted">Parent Organization: {property.organization.name}</p>
  <div className="row" style={{marginBottom:18}}>{tabs.map(([key,label])=><Link key={key} className={`button small ${tab===key?"":"secondary"}`} href={`/properties/${property.id}?tab=${key}`}>{label}</Link>)}</div>
  {tab==="work-areas"?<WorkAreaManager propertyId={property.id} propertyName={property.name} workAreas={workAreas} canManage={canManageOps} propertyActive={property.status==="ACTIVE"}/>:
   tab==="team"?<PropertyTeamAssignments propertyId={property.id} assignments={property.memberAssignments as any} eligibleMembers={eligible as any} canManage={m.role==="ADMIN"}/>:
   <><PropertyEditor property={property} canManage={canEditProperty}/>
    <WorkingHoursEditor title="Property Working Hours" endpoint={`/api/properties/${property.id}`} value={property.workingHours} canEdit={canEditProperty} inheritLabel={`Organization (${property.organization.name})`}/>
    <div className="card"><strong>Address</strong><p className="muted">{[property.addressLine1,property.addressLine2,property.addressLine3,property.city,property.state,property.postalCode,property.country].filter(Boolean).join(", ")||"No address entered"}</p><strong>Time Zone</strong><p className="muted">{property.timezone||property.organization.timezone}</p>{m.role==="PROPERTY_MANAGER"&&<p className="muted">Property master data is read-only. Admin controls Property details and assignments.</p>}</div>
   </>}
 </main></>;
}
