"use client";
import Link from "next/link";
import {useState} from "react";
import {useRouter} from "next/navigation";

export function PropertyTeamAssignments({propertyId,assignments,eligibleMembers,canManage}:{propertyId:string;assignments:any[];eligibleMembers:any[];canManage:boolean}){
 const router=useRouter();const[error,setError]=useState("");const[busy,setBusy]=useState(false);
 async function save(fd:FormData){
  setBusy(true);setError("");
  try{const r=await fetch(`/api/properties/${propertyId}/team`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberIds:fd.getAll("memberIds").map(String)})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to save assignments");router.refresh();}
  catch(e){setError(e instanceof Error?e.message:"Unable to save assignments")}finally{setBusy(false)}
 }
 const managers=assignments.filter(a=>a.member.role==="PROPERTY_MANAGER"),users=assignments.filter(a=>a.member.role==="USER");
 const list=(items:any[])=><>{items.map(a=><p key={a.id}><Link href={`/team/${a.member.id}`}><strong>{a.member.user.name||a.member.user.email}</strong></Link><br/><span className="muted">{a.member.user.email}{a.member.mobilePhone?` · ${a.member.mobilePhone}`:""}</span></p>)}{!items.length&&<p className="muted">None assigned.</p>}</>;
 return <div className="card"><h2 style={{marginTop:0}}>Team Assignments</h2><p className="muted">Property Managers and Users assigned to this Property.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:18}}><section><h3>Property Managers</h3>{list(managers)}</section><section><h3>Users</h3>{list(users)}</section></div>
  {canManage?<form action={save} style={{marginTop:20}}><h3>Manage Assignments</h3>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:8}}>{eligibleMembers.map(m=><label key={m.id} className="row compact"><input type="checkbox" name="memberIds" value={m.id} defaultChecked={assignments.some(a=>a.organizationMemberId===m.id)} disabled={m.status!=="ACTIVE"}/>{m.user.name||m.user.email} · {m.role.replace("PROPERTY_MANAGER","Property Manager")}</label>)}</div>
   {error&&<p className="error">{error}</p>}<button className="button" disabled={busy} style={{marginTop:12}}>{busy?"Saving...":"Save Team Assignments"}</button>
  </form>:<p className="muted">Property assignments are read-only for Property Managers.</p>}
 </div>
}
