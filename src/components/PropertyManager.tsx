"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Address = { addressLine1:string|null;addressLine2:string|null;addressLine3:string|null;city:string|null;state:string|null;postalCode:string|null;country:string|null };
type Props = { organizationId: string; defaultTimezone: string; organizationAddress: Address };

export function PropertyManager({ organizationId, defaultTimezone, organizationAddress }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setSaving(true);setError("");
    const payload = {organizationId,name:String(formData.get("name")||""),addressLine1:String(formData.get("addressLine1")||""),addressLine2:String(formData.get("addressLine2")||""),addressLine3:String(formData.get("addressLine3")||""),city:String(formData.get("city")||""),state:String(formData.get("state")||""),postalCode:String(formData.get("postalCode")||""),country:String(formData.get("country")||""),timezone:String(formData.get("timezone")||defaultTimezone||"")};
    try{const r=await fetch("/api/properties",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||"Unable to create property");setOpen(false);router.refresh()}catch(e){setError(e instanceof Error?e.message:"Unable to create property")}finally{setSaving(false)}
  }

  return <><button className="button" onClick={()=>setOpen(true)}>Add Property</button>{open&&<div className="modalBackdrop"><div className="modal"><div className="row"><h2 style={{marginRight:"auto"}}>Add Property</h2><button className="button secondary" onClick={()=>setOpen(false)}>Close</button></div><p className="muted">Address is prefilled from the Organization and can be adjusted for this Property.</p><form action={submit}><div className="formGrid"><label>Property Name<input name="name" required minLength={2}/></label><label>Address Line 1<input name="addressLine1" defaultValue={organizationAddress.addressLine1||""}/></label><label>Address Line 2<input name="addressLine2" defaultValue={organizationAddress.addressLine2||""}/></label><label>Address Line 3<input name="addressLine3" defaultValue={organizationAddress.addressLine3||""}/></label><label>City<input name="city" defaultValue={organizationAddress.city||""}/></label><label>State<input name="state" defaultValue={organizationAddress.state||""}/></label><label>ZIP / PIN<input name="postalCode" defaultValue={organizationAddress.postalCode||""}/></label><label>Country<input name="country" defaultValue={organizationAddress.country||""}/></label><label>Time Zone<input name="timezone" defaultValue={defaultTimezone}/></label></div>{error&&<p className="error">{error}</p>}<div className="row" style={{marginTop:18}}><button type="button" className="button secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving?"Saving...":"Create Property"}</button></div></form></div></div>}</>;
}
