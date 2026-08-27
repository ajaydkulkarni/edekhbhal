"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Window = { start: string; end: string };
type Hours = { days: Record<string, Window[]> };
const labels=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const blank=():Hours=>({days:Object.fromEntries(labels.map((_,i)=>[String(i),[]]))});
const starter=():Hours=>({days:Object.fromEntries(labels.map((_,i)=>[String(i),i>=1&&i<=5?[{start:"09:00",end:"17:00"}]:[]]))});

export function WorkingHoursEditor({ title, endpoint, value, canEdit, inheritLabel }:{ title:string; endpoint:string; value:any; canEdit:boolean; inheritLabel?:string }) {
  const router=useRouter();
  const inherited=value===null||value===undefined;
  const [inherit,setInherit]=useState(Boolean(inheritLabel)&&inherited);
  const [unrestricted,setUnrestricted]=useState(!inheritLabel&&inherited);
  const [hours,setHours]=useState<Hours>(()=> value?.days ? {days:{...blank().days,...value.days}} : starter());
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  function add(day:number){setHours(h=>({...h,days:{...h.days,[day]:[...(h.days[String(day)]||[]),{start:"09:00",end:"17:00"}]}}))}
  function remove(day:number,index:number){setHours(h=>({...h,days:{...h.days,[day]:(h.days[String(day)]||[]).filter((_,i)=>i!==index)}}))}
  function update(day:number,index:number,key:"start"|"end",v:string){setHours(h=>({...h,days:{...h.days,[day]:(h.days[String(day)]||[]).map((w,i)=>i===index?{...w,[key]:v}:w)}}))}
  async function save(){setSaving(true);setError("");try{
    const workingHours = inherit || unrestricted ? null : hours;
    const r=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({workingHours})}); const d=await r.json(); if(!r.ok)throw new Error(d.error||"Unable to save working hours"); router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to save working hours")}finally{setSaving(false)}}
  return <div className="card workingHoursCard"><div className="row"><div style={{marginRight:"auto"}}><h2>{title}</h2><p className="muted">Multiple windows and overnight shifts are supported. A Schedule occurrence is generated only when the complete planned Schedule fits inside an effective working window.</p></div></div>
    {inheritLabel&&<label className="checkLabel"><input type="checkbox" checked={inherit} onChange={e=>setInherit(e.target.checked)} disabled={!canEdit}/> Inherit working hours from {inheritLabel}</label>}
    {!inheritLabel&&<label className="checkLabel"><input type="checkbox" checked={unrestricted} onChange={e=>setUnrestricted(e.target.checked)} disabled={!canEdit}/> Open 24×7 / no working-hour restriction</label>}
    {!inherit&&!unrestricted&&<div className="workingHoursGrid">{labels.map((label,day)=><div className="workingDay" key={day}><strong>{label}</strong><div>{(hours.days[String(day)]||[]).map((w,i)=><div className="row compact" key={i}><input type="time" value={w.start} onChange={e=>update(day,i,"start",e.target.value)} disabled={!canEdit}/><span>to</span><input type="time" value={w.end} onChange={e=>update(day,i,"end",e.target.value)} disabled={!canEdit}/>{canEdit&&<button type="button" className="button small danger" onClick={()=>remove(day,i)}>Remove</button>}</div>)}{!(hours.days[String(day)]||[]).length&&<span className="muted">Closed</span>}</div>{canEdit&&<button type="button" className="button small secondary" onClick={()=>add(day)}>Add window</button>}</div>)}</div>}
    {error&&<p className="error">{error}</p>}{canEdit&&<button type="button" className="button" onClick={save} disabled={saving}>{saving?"Saving...":"Save Working Hours"}</button>}
  </div>
}
