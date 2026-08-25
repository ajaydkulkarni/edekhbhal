"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function Onboarding(){
  const router=useRouter(); const [error,setError]=useState(""); const [saving,setSaving]=useState(false);
  async function submit(fd:FormData){setSaving(true);setError("");const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
    const payload=Object.fromEntries(["name","logoUrl","addressLine1","addressLine2","addressLine3","city","state","postalCode","country"].map(k=>[k,String(fd.get(k)||"")]));
    try{const r=await fetch("/api/organizations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,timezone})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to create organization");router.push("/dashboard");router.refresh()}catch(e){setError(e instanceof Error?e.message:"Unable to create organization")}finally{setSaving(false)}
  }
  return <main className="container"><div className="card"><h1>Create Organization</h1><form action={submit}><div className="formGrid">
    <label>Organization Name<input name="name" required minLength={2}/></label><label>Organization Logo URL<input name="logoUrl"/></label>
    <label>Address Line 1<input name="addressLine1"/></label><label>Address Line 2<input name="addressLine2"/></label><label>Address Line 3<input name="addressLine3"/></label>
    <label>City<input name="city"/></label><label>State<input name="state"/></label><label>ZIP / PIN<input name="postalCode"/></label><label>Country<input name="country"/></label>
  </div>{error&&<p className="error">{error}</p>}<button className="button" disabled={saving}>{saving?"Creating...":"Create Organization"}</button></form></div></main>
}
