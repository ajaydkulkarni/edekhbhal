import Link from "next/link";
import {redirect} from "next/navigation";
import {Nav} from "@/components/Nav";import{getSessionUser}from"@/lib/session";import{prisma}from"@/lib/prisma";
export default async function ReportsPage(){
 const user=await getSessionUser();if(!user)redirect("/login");
 const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});
 if(!membership)redirect("/onboarding");if(!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))redirect("/dashboard");
 const cards=[
  ["Service Log","Task-level execution history with planned versus actual duration, deviation, servicing user and actual start/end time.","/reports/service-log","Open Service Log"],
  ["Service Compliance & Analytics","Completed, partial and missed occurrence compliance by Property, Work Area, Schedule and User, with occurrence drill-down.","/reports/compliance","Open Compliance"],
  ["Reported Notes / Work Requests","Task and Schedule notes reported from the field, including reporter, Work Area, dismissal history and any Schedule created in response.","/reports/reported-work","Open Reported Work"]
 ];
 return <><Nav/><main className="container"><h1>Reports</h1><p className="muted">Operational reporting for {membership.organization.name}.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>{cards.map(c=><div className="card" key={c[2]}><h2 style={{marginTop:0}}>{c[0]}</h2><p className="muted">{c[1]}</p><Link className="button" href={c[2]}>{c[3]}</Link></div>)}</div></main></>;
}
