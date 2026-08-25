import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function QrLanding({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const qr=await prisma.qrCode.findUnique({where:{id:token},include:{workArea:{include:{property:{include:{organization:true}}}}}});
  if(!qr||qr.status!=="ACTIVE")notFound();
  const wa=qr.workArea;
  return <main className="container"><div className="card" style={{maxWidth:700,margin:"50px auto"}}>
    <p className="muted">eDekhbhal Work Area</p><h1>{wa.name}</h1>
    <p>{wa.description||"No description"}</p><p><strong>Location:</strong> {wa.locationIdentifier||"Not specified"}</p>
    <hr style={{border:0,borderTop:"1px solid #e5e7eb",margin:"20px 0"}}/>
    <p><strong>Property:</strong> {wa.property.name}</p><p><strong>Organization:</strong> {wa.property.organization.name}</p>
  </div></main>;
}
