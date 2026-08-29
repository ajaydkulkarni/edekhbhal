"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

export function PersonnelProfileManager({member,properties,photoUrl,canEditProfile,canManageAccess,showNotes,isSelf}:{member:any;properties:any[];photoUrl:string|null;canEditProfile:boolean;canManageAccess:boolean;showNotes:boolean;isSelf:boolean}){
 const router=useRouter();const[error,setError]=useState("");const[busy,setBusy]=useState(false);
 async function patch(payload:object){
   setBusy(true);setError("");
   try{const r=await fetch(`/api/team/${member.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to update profile");router.refresh();}
   catch(e){setError(e instanceof Error?e.message:"Unable to update profile")}finally{setBusy(false)}
 }
 async function saveProfile(fd:FormData){await patch({
   name:String(fd.get("name")||""),addressLine1:String(fd.get("addressLine1")||""),addressLine2:String(fd.get("addressLine2")||""),addressLine3:String(fd.get("addressLine3")||""),
   city:String(fd.get("city")||""),state:String(fd.get("state")||""),postalCode:String(fd.get("postalCode")||""),country:String(fd.get("country")||""),
   mobilePhone:String(fd.get("mobilePhone")||""),residencePhone:String(fd.get("residencePhone")||""),alternatePhone:String(fd.get("alternatePhone")||""),
   ...(showNotes?{notes:String(fd.get("notes")||"")}:{})
 })}
 async function saveProperties(fd:FormData){await patch({propertyIds:fd.getAll("propertyIds").map(String)})}

 async function signedUpload(file:File,kind:"photo"|"document"){
   const r=await fetch(`/api/team/${member.id}/${kind}/upload-url`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:file.name,mimeType:file.type||"application/octet-stream",sizeBytes:file.size})});
   const t=await r.json();if(!r.ok)throw new Error(t.error||"Unable to prepare upload");
   const upload=await fetch(t.signedUrl,{method:"PUT",headers:{"content-type":file.type||"application/octet-stream","cache-control":"max-age=3600","x-upsert":"false"},body:file});
   if(!upload.ok)throw new Error(`Upload failed (${upload.status}).`);return t;
 }
 async function uploadPhoto(fd:FormData){
   const file=fd.get("photo");if(!(file instanceof File)||!file.size)return;
   setBusy(true);setError("");
   try{const t=await signedUpload(file,"photo");const r=await fetch(`/api/team/${member.id}/photo/confirm`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({storagePath:t.path,mimeType:file.type,sizeBytes:file.size})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to save profile photo");router.refresh();}
   catch(e){setError(e instanceof Error?e.message:"Unable to upload photo")}finally{setBusy(false)}
 }
 async function uploadDocument(fd:FormData){
   const file=fd.get("document");if(!(file instanceof File)||!file.size)return;
   setBusy(true);setError("");
   try{const t=await signedUpload(file,"document");const r=await fetch(`/api/team/${member.id}/documents`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
     storagePath:t.path,fileName:file.name,mimeType:file.type||"application/octet-stream",sizeBytes:file.size,documentType:String(fd.get("documentType")||"Other"),description:String(fd.get("description")||""),expiryDate:String(fd.get("expiryDate")||"")||null
   })});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to save document");router.refresh();}
   catch(e){setError(e instanceof Error?e.message:"Unable to upload document")}finally{setBusy(false)}
 }

 const f=(name:string,label:string,value:string|null|undefined)=><label>{label}<input name={name} defaultValue={value||""} disabled={!canEditProfile}/></label>;

 return <>
   <div className="row"><div style={{marginRight:"auto"}}><h1>{member.user.name||member.user.email}</h1><p className="muted">{member.user.email}</p></div><div><strong>{member.role.replace("PROPERTY_MANAGER","Property Manager")}</strong><div className="muted">{member.status}</div></div></div>
   {error&&<p className="error">{error}</p>}
   <div style={{display:"grid",gridTemplateColumns:"minmax(220px,300px) 1fr",gap:20,alignItems:"start"}}>
     <div className="card"><h2 style={{marginTop:0}}>Profile Picture</h2>
       {photoUrl?<img src={photoUrl} alt="Team member profile" style={{width:180,height:180,objectFit:"cover",borderRadius:"50%",display:"block",margin:"0 auto 16px"}}/>:<div style={{width:180,height:180,borderRadius:"50%",margin:"0 auto 16px",display:"grid",placeItems:"center",background:"#f1f5f9",fontSize:48,fontWeight:700}}>{(member.user.name||member.user.email).slice(0,2).toUpperCase()}</div>}
       {canEditProfile&&<form action={uploadPhoto}><label>Add / Take Picture<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="user" required/></label><button className="button" disabled={busy}>Upload Picture</button></form>}
     </div>
     <div className="card"><h2 style={{marginTop:0}}>Personnel Details</h2>
       <form action={saveProfile}>
         <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
           {f("name","Name",member.user.name)}<label>Login Email<input value={member.user.email} disabled/></label>
           {f("mobilePhone","Mobile Phone",member.mobilePhone)}{f("residencePhone","Residence / Home Phone",member.residencePhone)}{f("alternatePhone","Alternate Phone",member.alternatePhone)}
           {f("addressLine1","Address Line 1",member.addressLine1)}{f("addressLine2","Address Line 2",member.addressLine2)}{f("addressLine3","Address Line 3",member.addressLine3)}
           {f("city","City",member.city)}{f("state","State / Province",member.state)}{f("postalCode","ZIP / Postal Code",member.postalCode)}{f("country","Country",member.country)}
         </div>
         {showNotes&&<label style={{marginTop:12}}>Internal Notes<textarea name="notes" rows={5} defaultValue={member.notes||""} disabled={!canEditProfile}/></label>}
         {canEditProfile&&<button className="button" disabled={busy} style={{marginTop:12}}>Save Personnel Details</button>}
       </form>
       {!showNotes&&isSelf&&<p className="muted">Internal management Notes are intentionally not visible on your self-service profile.</p>}
     </div>
   </div>

   <div className="card" style={{marginTop:20}}><h2 style={{marginTop:0}}>Property Access</h2>
     {member.role==="ADMIN"?<p>Admin has Organization-wide access to all Properties.</p>:canManageAccess?<form action={saveProperties}>
       <p className="muted">Only an Admin can change Property assignments.</p>
       <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>{properties.map(p=><label key={p.id} className="row compact"><input type="checkbox" name="propertyIds" value={p.id} defaultChecked={member.propertyAssignments.some((a:any)=>a.propertyId===p.id)} disabled={p.status!=="ACTIVE"}/>{p.name}</label>)}</div>
       <button className="button" disabled={busy} style={{marginTop:12}}>Save Property Assignments</button>
     </form>:<p>{member.propertyAssignments.length?member.propertyAssignments.map((a:any)=>a.property.name).join(", "):"No Properties assigned."}</p>}
   </div>

   <div className="card" style={{marginTop:20}}><h2 style={{marginTop:0}}>ID / Verification Documents</h2>
     <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Type</th><th>Description</th><th>File</th><th>Expiry</th><th>Uploaded</th></tr></thead><tbody>
       {member.personnelDocuments.map((d:any)=><tr key={d.id}><td>{d.documentType}</td><td>{d.description}</td><td>{d.signedUrl?<a href={d.signedUrl} target="_blank" rel="noreferrer">{d.fileName}</a>:d.fileName}</td><td>{d.expiryDate?new Date(d.expiryDate).toLocaleDateString():"—"}</td><td>{new Date(d.createdAt).toLocaleString()}</td></tr>)}
       {!member.personnelDocuments.length&&<tr><td colSpan={5} className="muted">No verification documents uploaded.</td></tr>}
     </tbody></table></div>
     {canEditProfile&&<form action={uploadDocument} style={{marginTop:18}}>
       <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
         <label>Document Type<select name="documentType" defaultValue="Driver's License"><option>Driver's License</option><option>Passport</option><option>Employee ID</option><option>Work Authorization</option><option>Certification</option><option>Other</option></select></label>
         <label>Description<input name="description" required placeholder="e.g. Utah Driver's License"/></label>
         <label>Expiry Date<input name="expiryDate" type="date"/></label>
         <label>Attachment<input name="document" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required/></label>
       </div><button className="button" disabled={busy} style={{marginTop:12}}>Upload Document</button>
     </form>}
   </div>
 </>;
}
