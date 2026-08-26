import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { WorkAreaManager } from "@/components/WorkAreaManager";
import { PropertyEditor } from "@/components/PropertyEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function PropertyDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const user=await getSessionUser(); if(!user)redirect("/login");
  const property=await prisma.property.findUnique({where:{id},include:{organization:true,workAreas:{include:{qrCodes:{where:{status:"ACTIVE"},orderBy:{generatedAt:"desc"},take:1}},orderBy:{name:"asc"}}}});
  if(!property)notFound();
  const m=await prisma.organizationMember.findUnique({where:{organizationId_userId:{organizationId:property.organizationId,userId:user.id}}});
  if(!m||m.status!=="ACTIVE")notFound();
  const workAreas=property.workAreas.map(w=>({...w,qrCodes:w.qrCodes.map(q=>({...q,generatedAt:q.generatedAt.toISOString()}))}));
  const canManage=["ADMIN","PROPERTY_MANAGER"].includes(m.role);
  return <><Nav/><main className="container">
    <div className="breadcrumbs"><Link href="/properties">Properties</Link> / {property.name}</div>
    <h1>{property.name}</h1><p className="muted">Parent Organization: {property.organization.name}</p><PropertyEditor property={property} canManage={canManage}/>
    <div className="card" style={{marginBottom:24}}>
      <strong>Address</strong><p className="muted">{[property.addressLine1,property.addressLine2,property.addressLine3,property.city,property.state,property.postalCode,property.country].filter(Boolean).join(", ")||"No address entered"}</p>
      <strong>Time Zone</strong><p className="muted">{property.timezone||property.organization.timezone}</p>
    </div>
    <WorkAreaManager propertyId={property.id} propertyName={property.name} workAreas={workAreas} canManage={canManage} propertyActive={property.status === "ACTIVE"}/>
  </main></>;
}
