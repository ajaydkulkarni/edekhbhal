"use client";
import Link from "next/link";
import {useState} from "react";
import {useRouter} from "next/navigation";

export function ReportedWorkActions({id,workAreaId,status,linkedScheduleId}:{id:string;workAreaId:string;status:"NEW"|"DISMISSED"|"SCHEDULE_CREATED";linkedScheduleId:string|null}) {
  const router=useRouter(); const[busy,setBusy]=useState(false); const[error,setError]=useState("");
  async function dismiss(){
    setBusy(true);setError("");
    try{
      const r=await fetch(`/api/reported-work/${id}/dismiss`,{method:"POST"});const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Unable to dismiss reported work.");router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Unable to dismiss reported work.");}finally{setBusy(false);}
  }
  if(linkedScheduleId)return <Link className="button secondary small" href={`/schedules/${linkedScheduleId}`}>View Schedule</Link>;
  return <div><div className="row compact">
    <Link className="button small" href={`/schedules/new?workAreaId=${encodeURIComponent(workAreaId)}&reportedWorkItemId=${encodeURIComponent(id)}`}>Create Schedule</Link>
    {status==="NEW"&&<button type="button" className="button secondary small" disabled={busy} onClick={dismiss}>{busy?"Dismissing...":"Dismiss"}</button>}
  </div>{error&&<small className="error" style={{display:"block",marginTop:6}}>{error}</small>}</div>;
}
