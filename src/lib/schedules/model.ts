export type ScheduleFrequency="ONE_TIME"|"RECURRING";
export type RecurrenceUnit="MINUTE"|"HOUR"|"DAY"|"WEEK"|"MONTH"|"YEAR";
export type EvidenceRule="NONE"|"PHOTO"|"VIDEO"|"RANDOM";
export type RandomEvidenceType="PHOTO"|"VIDEO"|"EITHER";
export type ScheduleTaskInput={taskId:string;sequence:number;plannedDurationMinutes:number;evidenceRule:EvidenceRule;randomEveryN:number|null;randomEvidenceType:RandomEvidenceType|null};

export function isValidIanaTimezone(value:string){try{new Intl.DateTimeFormat("en-US",{timeZone:value}).format(new Date(0));return true}catch{return false}}
export function splitLocalDateTime(value:string){const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);if(!m)throw new Error("Schedule Start date/time is required.");return{localDate:m[1],localTime:m[2]}}

export function normalizeRecurrence(input:{frequencyType:ScheduleFrequency;recurrenceUnit?:string|null;recurrenceInterval?:number|null;weekdays?:number[];monthDays?:number[];endLocalDate?:string|null}){
 if(input.frequencyType==="ONE_TIME")return{recurrenceUnit:null,recurrenceInterval:null,recurrenceConfig:null,endLocalDate:null};
 const unit=input.recurrenceUnit as RecurrenceUnit;
 if(!["MINUTE","HOUR","DAY","WEEK","MONTH","YEAR"].includes(unit))throw new Error("Select a valid recurrence unit.");
 const interval=Number(input.recurrenceInterval);
 if(!Number.isInteger(interval)||interval<1||interval>100000)throw new Error("Recurrence interval must be a positive whole number.");
 let recurrenceConfig:{weekdays?:number[];monthDays?:number[]}|null=null;
 if(unit==="WEEK"){const weekdays=[...new Set(input.weekdays??[])].sort((a,b)=>a-b);if(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw new Error("Weekly recurrence requires at least one valid weekday.");recurrenceConfig={weekdays}}
 else if(unit==="MONTH"){const monthDays=[...new Set(input.monthDays??[])].sort((a,b)=>a-b);if(!monthDays.length||monthDays.some(d=>!Number.isInteger(d)||d<1||d>31))throw new Error("Monthly recurrence requires at least one day from 1 to 31.");recurrenceConfig={monthDays}}
 return{recurrenceUnit:unit,recurrenceInterval:interval,recurrenceConfig,endLocalDate:input.endLocalDate||null};
}

export function buildScheduleTaskInputs(selected:Array<{taskId:string;sequence:number;plannedDurationMinutes:number;evidenceRule:EvidenceRule;randomEveryN?:number|null;randomEvidenceType?:RandomEvidenceType|null}>){
 if(!selected.length)throw new Error("Add at least one Task to the Schedule.");
 const sorted=[...selected].sort((a,b)=>a.sequence-b.sequence);
 if(sorted.some((x,i)=>x.sequence!==i+1))throw new Error("Task sequence must be contiguous starting at 1.");
 return sorted.map(item=>{
  if(!Number.isInteger(item.plannedDurationMinutes)||item.plannedDurationMinutes<1||item.plannedDurationMinutes>10080)throw new Error("Task duration must be between 1 and 10080 minutes.");
  if(item.evidenceRule==="RANDOM"&&(!Number.isInteger(item.randomEveryN)||Number(item.randomEveryN)<2||Number(item.randomEveryN)>1000||!item.randomEvidenceType))throw new Error("Random evidence requires a frequency from 2 to 1000 and a media policy.");
  return{taskId:item.taskId,sequence:item.sequence,plannedDurationMinutes:item.plannedDurationMinutes,evidenceRule:item.evidenceRule,randomEveryN:item.evidenceRule==="RANDOM"?Number(item.randomEveryN):null,randomEvidenceType:item.evidenceRule==="RANDOM"?item.randomEvidenceType!:null} satisfies ScheduleTaskInput;
 });
}
export function plannedOffsets(tasks:ScheduleTaskInput[]){let cursor=0;return tasks.map(task=>{const start=cursor;cursor+=task.plannedDurationMinutes;return{sequence:task.sequence,plannedStartOffsetMinutes:start,plannedEndOffsetMinutes:cursor}})}
