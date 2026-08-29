"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamManager({members,properties,actorRole,currentUserId}:{members:any[];properties:any[];actorRole:"ADMIN"|"PROPERTY_MANAGER"|"USER";currentUserId:string}){
  const router=useRouter(); const[error,setError]=useState(""); const[adding,setAdding]=useState(false);
  async function addMember(fd:FormData){
    setError("");
    const payload={
      email:String(fd.get("email")||""),
      name:String(fd.get("name")||""),
      role:actorRole==="ADMIN"?String(fd.get("role")||"USER"):"USER",
      mobilePhone:String(fd.get("mobilePhone")||""),
      propertyIds:fd.getAll("propertyIds").map(String)
    };
    const r=await fetch("/api/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const d=await r.json(); if(!r.ok){setError(d.error||"Unable to add team member");return;}
    setAdding(false);router.refresh();
  }
  async function update(id:string,payload:object){
    setError("");
    const r=await fetch(`/api/team/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const d=await r.json();if(!r.ok)setError(d.error||"Unable to update team member");else router.refresh();
  }

  return <>
    <div className="card" style={{marginBottom:20}}>
      <div className="row">
        <div style={{marginRight:"auto"}}><h2 style={{marginBottom:4}}>Add / Invite Team Member</h2><p className="muted" style={{marginTop:0}}>The personnel record is created immediately. Email delivery can be connected later.</p></div>
        <button type="button" className="button" onClick={()=>setAdding(v=>!v)}>{adding?"Close":"Add Team Member"}</button>
      </div>
      {adding&&<form action={addMember}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
          <label>Name<input name="name" required minLength={2}/></label>
          <label>Email / Login Email<input name="email" type="email" required/></label>
          <label>Mobile Phone<input name="mobilePhone"/></label>
          {actorRole==="ADMIN"&&<label>Role<select name="role" defaultValue="USER"><option value="USER">User</option><option value="PROPERTY_MANAGER">Property Manager</option><option value="ADMIN">Admin</option></select></label>}
        </div>
        {actorRole==="ADMIN"?<fieldset style={{marginTop:12}}><legend>Assigned Properties</legend><p className="muted">Property Managers and Users receive access only to selected Properties. Admins have Organization-wide access.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>
            {properties.map(p=><label key={p.id} className="row compact"><input type="checkbox" name="propertyIds" value={p.id} disabled={p.status!=="ACTIVE"}/>{p.name}</label>)}
          </div>
        </fieldset>:<p className="muted">Property Managers may add Users; Property assignment remains an Admin control.</p>}
        <button className="button" style={{marginTop:12}}>Create Team Member</button>
      </form>}
    </div>

    {error&&<p className="error">{error}</p>}
    <div className="card" style={{overflowX:"auto"}}><table className="table">
      <thead><tr><th>Team Member</th><th>Role</th><th>Status</th><th>Mobile</th><th>Assigned Properties</th><th>Actions</th></tr></thead>
      <tbody>{members.map(m=><tr key={m.id}>
        <td><strong>{m.user.name||m.user.email}</strong><br/><span className="muted">{m.user.email}</span></td>
        <td>{m.role.replace("PROPERTY_MANAGER","Property Manager")}</td><td>{m.status}</td><td>{m.mobilePhone||"—"}</td>
        <td>{m.role==="ADMIN"?"All Properties":m.propertyAssignments.length?m.propertyAssignments.map((x:any)=>x.property.name).join(", "):"None"}</td>
        <td><div className="row compact">
          <Link className="button small secondary" href={`/team/${m.id}`}>View Profile</Link>
          {actorRole==="ADMIN"&&m.userId!==currentUserId&&<>
            <select value={m.role} onChange={e=>update(m.id,{role:e.target.value})}><option value="USER">User</option><option value="PROPERTY_MANAGER">Property Manager</option><option value="ADMIN">Admin</option></select>
            <button className="button small secondary" onClick={()=>update(m.id,{status:m.status==="ACTIVE"?"INACTIVE":"ACTIVE"})}>{m.status==="ACTIVE"?"Inactivate":"Reactivate"}</button>
          </>}
        </div></td>
      </tr>)}</tbody>
    </table></div>
  </>;
}
