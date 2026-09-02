"use client";

import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";

type WorkAreaOption={id:string;name:string;propertyName:string;timezone:string;status:string;propertyStatus:string};
type TaskOption={id:string;name:string;status:string};
type EvidenceRule="NONE"|"PHOTO"|"VIDEO"|"RANDOM";
type ScheduleItem={id?:string;taskId:string;taskName:string;adHocDescription?:string;source?:"LIBRARY"|"ADHOC";saveToLibrary?:boolean;duration:string;evidenceRule:EvidenceRule;randomEveryN:number;randomEvidenceType:"PHOTO"|"VIDEO"|"EITHER"};
type InitialSchedule={id:string;name:string;frequencyType:"ONE_TIME"|"RECURRING";recurrenceUnit:"MINUTE"|"HOUR"|"DAY"|"WEEK"|"MONTH"|"YEAR"|null;recurrenceInterval:number|null;recurrenceConfig:{weekdays?:number[];monthDays?:number[]}|null;startLocal:string;timezone:string;endDate:string|null;workAreaId:string;status:string;items:ScheduleItem[]};

function durationMinutes(value:string){if(!/^\d{2}:[0-5]\d$/.test(value))return null;const[h,m]=value.split(":").map(Number);const total=h*60+m;return total>0?total:null}
function addMinutes(local:string,minutes:number){if(!local)return"";const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);if(!m)return"";const[,y,mo,d,h,mi]=m;const value=new Date(Date.UTC(+y,+mo-1,+d,+h,+mi+minutes));return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(value)}
const DAYS=[["Sun",0],["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6]] as const;

export function ScheduleEditor({canManage,workAreas,tasks,initial,defaults}:{canManage:boolean;workAreas:WorkAreaOption[];tasks:TaskOption[];initial?:InitialSchedule;defaults?:{workAreaId?:string;reportedWorkItemId?:string;suggestedName?:string}}){
 const router=useRouter();
 const [name,setName]=useState(initial?.name??defaults?.suggestedName??"");
 const [frequencyType,setFrequencyType]=useState<"ONE_TIME"|"RECURRING">(initial?.frequencyType??"ONE_TIME");
 const [recurrenceUnit,setRecurrenceUnit]=useState<"MINUTE"|"HOUR"|"DAY"|"WEEK"|"MONTH"|"YEAR">(initial?.recurrenceUnit??"DAY");
 const [recurrenceInterval,setRecurrenceInterval]=useState(initial?.recurrenceInterval??1);
 const [weekdays,setWeekdays]=useState<number[]>(initial?.recurrenceConfig?.weekdays??[]);
 const [monthDays,setMonthDays]=useState((initial?.recurrenceConfig?.monthDays??[]).join(", "));
 const [workAreaId,setWorkAreaId]=useState(initial?.workAreaId??defaults?.workAreaId??workAreas.find(w=>w.status==="ACTIVE"&&w.propertyStatus==="ACTIVE")?.id??"");
 const [startLocal,setStartLocal]=useState(initial?.startLocal??"");
 const [endDate,setEndDate]=useState(initial?.endDate??"");
 const [items,setItems]=useState<ScheduleItem[]>((initial?.items??[]).map(x=>({...x,source:x.source??"LIBRARY"})));
 const [taskMode,setTaskMode]=useState<"LIBRARY"|"ADHOC">("LIBRARY");
 const [taskToAdd,setTaskToAdd]=useState("");
 const [adHocName,setAdHocName]=useState("");
 const [adHocDescription,setAdHocDescription]=useState("");
 const [adHocSave,setAdHocSave]=useState(false);
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const selectedWorkArea=workAreas.find(w=>w.id===workAreaId);
 const activeTasks=tasks.filter(t=>t.status==="ACTIVE");

 const timeline=useMemo(()=>{let cursor=0;return items.map(item=>{const mins=durationMinutes(item.duration)??0;const start=cursor;cursor+=mins;return{start,end:cursor,valid:mins>0}})},[items]);
 const totalMinutes=timeline.length?timeline[timeline.length-1].end:0;

 function addLibraryTask(){const task=activeTasks.find(t=>t.id===taskToAdd);if(!task)return;setItems(c=>[...c,{taskId:task.id,taskName:task.name,source:"LIBRARY",duration:"00:30",evidenceRule:"NONE",randomEveryN:3,randomEvidenceType:"EITHER"}]);setTaskToAdd("")}
 function addAdHocTask(){if(adHocName.trim().length<2){setError("Enter an ad-hoc Task name.");return}setError("");setItems(c=>[...c,{taskId:"",taskName:adHocName.trim(),adHocDescription:adHocDescription.trim(),source:"ADHOC",saveToLibrary:adHocSave,duration:"00:30",evidenceRule:"NONE",randomEveryN:3,randomEvidenceType:"EITHER"}]);setAdHocName("");setAdHocDescription("");setAdHocSave(false)}
 function updateItem(i:number,patch:Partial<ScheduleItem>){setItems(c=>c.map((x,n)=>n===i?{...x,...patch}:x))}
 function move(i:number,d:-1|1){const n=i+d;if(n<0||n>=items.length)return;setItems(c=>{const a=[...c];[a[i],a[n]]=[a[n],a[i]];return a})}
 function remove(i:number){setItems(c=>c.filter((_,n)=>n!==i))}
 function toggleWeekday(day:number){setWeekdays(c=>c.includes(day)?c.filter(x=>x!==day):[...c,day].sort())}

 async function save(){
  if(!canManage)return;setSaving(true);setError("");
  try{
   if(!name.trim())throw new Error("Schedule Name is required.");
   if(!workAreaId)throw new Error("Please select a Work Area.");
   if(!startLocal)throw new Error("Schedule Start date/time is required.");
   if(!items.length)throw new Error("Add at least one Task.");
   if(items.some(x=>durationMinutes(x.duration)===null))throw new Error("Every Task duration must use HH:MM and be greater than 00:00.");
   if(items.some(x=>x.evidenceRule==="RANDOM"&&(!Number.isInteger(x.randomEveryN)||x.randomEveryN<2)))throw new Error("Random evidence frequency must be at least 1 in 2 performances.");
   let recurrenceConfig:{weekdays?:number[];monthDays?:number[]}|null=null;
   if(frequencyType==="RECURRING"&&recurrenceUnit==="WEEK")recurrenceConfig={weekdays};
   if(frequencyType==="RECURRING"&&recurrenceUnit==="MONTH"){const p=monthDays.split(",").map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>=1&&x<=31);if(!p.length)throw new Error("Enter at least one valid monthly day (1-31).");recurrenceConfig={monthDays:Array.from(new Set(p)).sort((a,b)=>a-b)}}
   const payload={name:name.trim(),frequencyType,recurrenceUnit:frequencyType==="RECURRING"?recurrenceUnit:null,recurrenceInterval:frequencyType==="RECURRING"?Number(recurrenceInterval):null,recurrenceConfig,startLocal,endDate:frequencyType==="RECURRING"?(endDate||null):null,timezone:selectedWorkArea?.timezone||initial?.timezone||"UTC",workAreaId,reportedWorkItemId:initial?undefined:(defaults?.reportedWorkItemId??null),tasks:items.map((item,index)=>({taskId:item.taskId||null,adHocName:item.source==="ADHOC"?item.taskName:null,adHocDescription:item.source==="ADHOC"?(item.adHocDescription||null):null,saveToLibrary:item.source==="ADHOC"?Boolean(item.saveToLibrary):false,sequence:index+1,duration:item.duration,evidenceRule:item.evidenceRule,randomEveryN:item.evidenceRule==="RANDOM"?item.randomEveryN:null,randomEvidenceType:item.evidenceRule==="RANDOM"?item.randomEvidenceType:null}))};
   const r=await fetch(initial?`/api/schedules/${initial.id}`:"/api/schedules",{method:initial?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const data=await r.json();if(!r.ok)throw new Error(data.error||"Unable to save Schedule.");
   if(initial)router.refresh();else router.push(`/schedules/${data.schedule.id}`);
  }catch(e){setError(e instanceof Error?e.message:"Unable to save Schedule.")}finally{setSaving(false)}
 }

 async function toggleStatus(){if(!initial||!canManage)return;const next=initial.status==="ACTIVE"?"INACTIVE":"ACTIVE";const r=await fetch(`/api/schedules/${initial.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});const d=await r.json();if(!r.ok)setError(d.error||"Unable to update status.");else router.refresh()}
 async function duplicate(){if(!initial||!canManage)return;const r=await fetch(`/api/schedules/${initial.id}/duplicate`,{method:"POST"});const d=await r.json();if(!r.ok)setError(d.error||"Unable to duplicate Schedule.");else router.push(`/schedules/${d.schedule.id}`)}

 return <div className="scheduleEditor nextScheduleEditor">
  <section className="nextBuilderCard">
   <div className="builderStep"><span>1</span><div><strong>Where</strong><small>Choose the location where this work will happen.</small></div></div>
   <div className="formGrid">
    <label>Schedule Name<textarea rows={2} maxLength={500} value={name} onChange={e=>setName(e.target.value)} disabled={!canManage}/></label>
    <label>Work Area<select value={workAreaId} onChange={e=>setWorkAreaId(e.target.value)} disabled={!canManage}><option value="">Select Work Area</option>{workAreas.map(wa=>{const selectable=wa.status==="ACTIVE"&&wa.propertyStatus==="ACTIVE";const retained=initial?.workAreaId===wa.id;if(!selectable&&!retained)return null;return <option key={wa.id} value={wa.id}>{wa.name} — {wa.propertyName}{selectable?"":" (Inactive)"}</option>})}</select><small className="muted">Property context is shown with every Work Area.</small></label>
   </div>
  </section>

  <section className="nextBuilderCard">
   <div className="builderStep"><span>2</span><div><strong>When</strong><small>Set a one-time date or a recurrence pattern.</small></div></div>
   <div className="segmented"><button type="button" className={frequencyType==="ONE_TIME"?"active":""} onClick={()=>canManage&&setFrequencyType("ONE_TIME")}>One Time</button><button type="button" className={frequencyType==="RECURRING"?"active":""} onClick={()=>canManage&&setFrequencyType("RECURRING")}>Recurring</button></div>
   <div className="formGrid"><label>Start Date / Time<input type="datetime-local" value={startLocal} onChange={e=>setStartLocal(e.target.value)} disabled={!canManage}/><small className="muted">Time zone: {selectedWorkArea?.timezone||initial?.timezone||"UTC"}</small></label>{frequencyType==="RECURRING"&&<label>End Date (optional)<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={!canManage}/></label>}</div>
   {frequencyType==="RECURRING"&&<div className="recurrenceBox"><div className="row wrap"><span>Every</span><input className="numberInput" type="number" min={1} value={recurrenceInterval} onChange={e=>setRecurrenceInterval(Number(e.target.value))}/><select value={recurrenceUnit} onChange={e=>setRecurrenceUnit(e.target.value as any)}><option value="MINUTE">Minute(s)</option><option value="HOUR">Hour(s)</option><option value="DAY">Day(s)</option><option value="WEEK">Week(s)</option><option value="MONTH">Month(s)</option><option value="YEAR">Year(s)</option></select></div>{recurrenceUnit==="WEEK"&&<div className="weekdayRow">{DAYS.map(([label,value])=><label className="checkLabel" key={value}><input type="checkbox" checked={weekdays.includes(value)} onChange={()=>toggleWeekday(value)}/>{label}</label>)}</div>}{recurrenceUnit==="MONTH"&&<label>Day(s) of month<input value={monthDays} onChange={e=>setMonthDays(e.target.value)} placeholder="1, 15, 30"/></label>}</div>}
  </section>

  <section className="nextBuilderCard">
   <div className="builderStep"><span>3</span><div><strong>What</strong><small>Add controlled library Tasks or create corrective/ad-hoc work on the spot.</small></div></div>
   {canManage&&<div className="taskComposer">
    <div className="segmented compactSegment"><button type="button" className={taskMode==="LIBRARY"?"active":""} onClick={()=>setTaskMode("LIBRARY")}>Task Library</button><button type="button" className={taskMode==="ADHOC"?"active":""} onClick={()=>setTaskMode("ADHOC")}>Ad-hoc Task</button></div>
    {taskMode==="LIBRARY"?<div className="taskAddRow"><select value={taskToAdd} onChange={e=>setTaskToAdd(e.target.value)}><option value="">Choose reusable Task</option>{activeTasks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button type="button" className="button" onClick={addLibraryTask} disabled={!taskToAdd}>Add Task</button></div>:<div className="adhocComposer"><label>Task name<input value={adHocName} onChange={e=>setAdHocName(e.target.value)} placeholder="e.g. Repair leaking pipe" maxLength={500}/></label><label>Instructions / context<textarea value={adHocDescription} onChange={e=>setAdHocDescription(e.target.value)} rows={3} placeholder="Optional corrective-work instructions"/></label><label className="checkLabel saveLibrary"><input type="checkbox" checked={adHocSave} onChange={e=>setAdHocSave(e.target.checked)}/>Save this Task to the reusable Task Library</label><button type="button" className="button" onClick={addAdHocTask}>Add Ad-hoc Task</button></div>}
   </div>}
   {error&&<p className="error">{error}</p>}
   <div className="nextTaskList">{items.map((item,index)=>{const line=timeline[index];return <article key={`${item.taskId||item.taskName}-${index}`} className="nextTaskRow">
    <div className="taskNumber">{index+1}</div>
    <div className="taskMain"><div className="taskTitleLine"><strong>{item.taskName}</strong><span className={item.source==="ADHOC"?"sourceChip adhoc":"sourceChip"}>{item.source==="ADHOC"?(item.saveToLibrary?"Ad-hoc · save to library":"Ad-hoc · this schedule only"):"Task Library"}</span></div>{item.adHocDescription&&<p>{item.adHocDescription}</p>}<div className="taskFields"><label>Duration<input value={item.duration} onChange={e=>updateItem(index,{duration:e.target.value})} disabled={!canManage}/>{!line.valid&&<small className="fieldError">Use HH:MM</small>}</label><label>Start<span>{startLocal&&line.valid?addMinutes(startLocal,line.start):"—"}</span></label><label>End<span>{startLocal&&line.valid?addMinutes(startLocal,line.end):"—"}</span></label><label>Evidence<select value={item.evidenceRule} onChange={e=>updateItem(index,{evidenceRule:e.target.value as EvidenceRule})} disabled={!canManage}><option value="NONE">None</option><option value="PHOTO">Photo every time</option><option value="VIDEO">Video every time</option><option value="RANDOM">Random sample</option></select></label></div>{item.evidenceRule==="RANDOM"&&<div className="randomEvidence"><span>Require 1 in every</span><input type="number" min={2} max={1000} value={item.randomEveryN} onChange={e=>updateItem(index,{randomEveryN:Number(e.target.value)})}/><span>performances</span><select value={item.randomEvidenceType} onChange={e=>updateItem(index,{randomEvidenceType:e.target.value as any})}><option value="PHOTO">Photo</option><option value="VIDEO">Video</option><option value="EITHER">Photo or Video</option></select></div>}</div>
    {canManage&&<div className="taskActions"><button type="button" onClick={()=>move(index,-1)} disabled={index===0} aria-label={`Move ${item.taskName} up`}>↑</button><button type="button" onClick={()=>move(index,1)} disabled={index===items.length-1} aria-label={`Move ${item.taskName} down`}>↓</button><button type="button" onClick={()=>remove(index)} aria-label={`Remove ${item.taskName}`}>×</button></div>}
   </article>})}{!items.length&&<div className="nextEmpty">No Tasks yet. Add a library Task or create an ad-hoc corrective Task.</div>}</div>
  </section>

  <div className="nextScheduleFooter"><div><small>Total planned duration</small><strong>{String(Math.floor(totalMinutes/60)).padStart(2,"0")}:{String(totalMinutes%60).padStart(2,"0")}</strong></div><div><small>Planned end</small><strong>{startLocal&&totalMinutes?addMinutes(startLocal,totalMinutes):"—"}</strong></div>{canManage&&<button type="button" className="button" onClick={save} disabled={saving}>{saving?"Saving...":initial?"Save Schedule":"Create Schedule"}</button>}</div>
  {canManage&&initial&&<div className="row wrap" style={{marginTop:14}}><button type="button" className="button secondary" onClick={toggleStatus}>{initial.status==="ACTIVE"?"Inactivate Schedule":"Reactivate Schedule"}</button><button type="button" className="button secondary" onClick={duplicate}>Duplicate Schedule</button></div>}
 </div>
}
