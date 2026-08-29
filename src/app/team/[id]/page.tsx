import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {Nav} from "@/components/Nav";
import {PersonnelProfileManager} from "@/components/PersonnelProfileManager";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {assignedPropertyIds} from "@/lib/propertyAccess";
import {createPersonnelSignedDownload} from "@/lib/personnelStorage";

export default async function TeamMemberPage({params}:{params:Promise<{id:string}>}){
 const actor=await getSessionUser();if(!actor)redirect("/login");
 const am=await prisma.organizationMember.findFirst({where:{userId:actor.id,status:"ACTIVE"}});
 if(!am)redirect("/onboarding");
 const{id}=await params;
 const target=await prisma.organizationMember.findFirst({
   where:{id,organizationId:am.organizationId},
   include:{user:true,propertyAssignments:{include:{property:true}},personnelDocuments:{include:{uploadedBy:{select:{id:true,name:true,email:true}}},orderBy:{createdAt:"desc"}}}
 });
 if(!target)notFound();
 const isSelf=target.userId===actor.id;
 if(am.role==="USER"&&!isSelf)notFound();
 if(am.role==="PROPERTY_MANAGER"){
   if(target.role!=="USER")notFound();
   const scope=await assignedPropertyIds(am);
   if(!target.propertyAssignments.some(a=>scope?.includes(a.propertyId)))notFound();
 }
 const properties=await prisma.property.findMany({where:{organizationId:am.organizationId},orderBy:{name:"asc"},select:{id:true,name:true,status:true}});
 const docs=await Promise.all(target.personnelDocuments.map(async d=>({...d,createdAt:d.createdAt.toISOString(),expiryDate:d.expiryDate?.toISOString()??null,signedUrl:await createPersonnelSignedDownload(d.storagePath).catch(()=>null)})));
 const photoUrl=target.photoStoragePath?await createPersonnelSignedDownload(target.photoStoragePath).catch(()=>null):null;
 const canEdit=am.role==="ADMIN"||(am.role==="PROPERTY_MANAGER"&&target.role==="USER");
 return <><Nav/><main className="container" style={{maxWidth:1100}}>
   <div className="breadcrumbs">{am.role!=="USER"?<><Link href="/team">Team</Link> / </>:null}{target.user.name||target.user.email}</div>
   <PersonnelProfileManager member={{...target,createdAt:target.createdAt.toISOString(),updatedAt:target.updatedAt.toISOString(),personnelDocuments:docs} as any}
     properties={properties} photoUrl={photoUrl} canEditProfile={canEdit} canManageAccess={am.role==="ADMIN"} showNotes={am.role!=="USER"} isSelf={isSelf}/>
 </main></>;
}
