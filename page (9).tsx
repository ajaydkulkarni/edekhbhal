import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function Audit(){
  const user=await getSessionUser(); if(!user)redirect("/login");
  const m=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if(!m)redirect("/onboarding");
  const rows=await prisma.auditLog.findMany({where:{organizationId:m.organizationId},include:{user:true},orderBy:{createdAt:"desc"},take:100});
  return <><Nav/><main className="container"><h1>Audit Trail</h1><div className="card"><table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Old Value</th><th>New Value</th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id}><td>{r.createdAt.toLocaleString()}</td><td>{r.user?.email||"System"}</td><td>{r.action}</td><td>{r.entityType||"—"} {r.entityId?`(${r.entityId})`:""}</td><td><pre className="mono">{r.oldValue?JSON.stringify(r.oldValue,null,2):"—"}</pre></td><td><pre className="mono">{r.newValue?JSON.stringify(r.newValue,null,2):"—"}</pre></td></tr>)}
    {!rows.length&&<tr><td colSpan={6} className="muted">No audit events yet.</td></tr>}
  </tbody></table></div></main></>;
}
