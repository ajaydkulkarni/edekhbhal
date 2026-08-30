import {NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
const STAGING_APP_URL="https://edekhbhal-staging.vercel.app";
function enabled(){return process.env.E2E_TESTING_ENABLED==="true"&&(process.env.APP_URL||"").replace(/\/$/,"")===STAGING_APP_URL;}
export async function POST(req:Request){
 try{
  if(!enabled())return NextResponse.json({error:"Not found."},{status:404});
  if(!process.env.E2E_TEST_SECRET||req.headers.get("x-e2e-secret")!==process.env.E2E_TEST_SECRET)return NextResponse.json({error:"Forbidden."},{status:403});
  const adminEmail=(process.env.E2E_ADMIN_EMAIL||"").toLowerCase(),userEmail=(process.env.E2E_USER_EMAIL||"").toLowerCase();
  const admin=await prisma.user.findUnique({where:{email:adminEmail},include:{memberships:{where:{role:"ADMIN",status:"ACTIVE"}}}});
  const user=await prisma.user.findUnique({where:{email:userEmail},include:{memberships:{where:{role:"USER",status:"ACTIVE"}}}});
  const org=admin?.memberships[0];if(!admin||!org||!user)return NextResponse.json({error:"E2E identities are not ready."},{status:400});
  const properties=await prisma.property.findMany({where:{organizationId:org.organizationId,name:{in:["E2E Property A","E2E Property B"]}}});
  const propertyA=properties.find(p=>p.name==="E2E Property A"),propertyB=properties.find(p=>p.name==="E2E Property B");if(!propertyA||!propertyB)return NextResponse.json({error:"Run /api/e2e/setup first."},{status:400});
  async function area(propertyId:string,name:string){const found=await prisma.workArea.findFirst({where:{propertyId,name}});return found?prisma.workArea.update({where:{id:found.id},data:{status:"ACTIVE"}}):prisma.workArea.create({data:{propertyId,name,status:"ACTIVE"}});}
  const workAreaA=await area(propertyA.id,"E2E Work Area A"),workAreaB=await area(propertyB.id,"E2E Work Area B");
  let task=await prisma.task.findFirst({where:{organizationId:org.organizationId,name:"E2E Reported Work Task"}});
  task=task?await prisma.task.update({where:{id:task.id},data:{status:"ACTIVE"}}):await prisma.task.create({data:{organizationId:org.organizationId,name:"E2E Reported Work Task",descriptionHtml:"<p>E2E deterministic Task.</p>",createdById:admin.id}});
  async function schedule(name:string,workAreaId:string){
    let s=await prisma.schedule.findFirst({where:{organizationId:org.organizationId,name}});
    if(!s)s=await prisma.schedule.create({data:{organizationId:org.organizationId,name,frequencyType:"ONE_TIME",startAt:new Date(Date.now()-300000),timezone:"America/Denver",workAreaId,createdById:admin.id}});
    else s=await prisma.schedule.update({where:{id:s.id},data:{workAreaId,status:"ACTIVE"}});
    await prisma.scheduleTask.upsert({where:{scheduleId_sequence:{scheduleId:s.id,sequence:1}},update:{taskId:task!.id,durationMinutes:30,plannedStartOffsetMinutes:0,plannedEndOffsetMinutes:30,evidenceRule:"NONE",randomEveryN:null,randomEvidenceType:null},create:{scheduleId:s.id,taskId:task!.id,sequence:1,durationMinutes:30,plannedStartOffsetMinutes:0,plannedEndOffsetMinutes:30,evidenceRule:"NONE"}});
    return s;
  }
  const scheduleA=await schedule("E2E Active Schedule A",workAreaA.id),scheduleB=await schedule("E2E Visibility Schedule B",workAreaB.id);
  async function occurrence(s:any,wa:any,property:any,assignedUserId:string|null,active:boolean){
    let o=await prisma.scheduleOccurrence.findFirst({where:{scheduleId:s.id}});const start=new Date(Date.now()-300000),end=new Date(Date.now()+1500000);
    const data={workAreaId:wa.id,scheduleNameSnapshot:s.name,workAreaNameSnapshot:wa.name,propertyNameSnapshot:property.name,plannedDurationMinutes:30,status:active?"IN_PROGRESS" as const:"PENDING" as const,assignedUserId,startedAt:active?start:null,completedAt:null,actualDurationSeconds:null};
    if(!o)o=await prisma.scheduleOccurrence.create({data:{organizationId:org.organizationId,scheduleId:s.id,scheduledStartAt:start,scheduledEndAt:end,timezone:"America/Denver",...data}});
    else o=await prisma.scheduleOccurrence.update({where:{id:o.id},data});
    const ot=await prisma.scheduleOccurrenceTask.upsert({where:{occurrenceId_sequence:{occurrenceId:o.id,sequence:1}},update:{taskId:task!.id,taskNameSnapshot:task!.name,taskDescriptionSnapshot:"<p>E2E deterministic Task.</p>",plannedDurationMinutes:30,plannedStartAt:start,plannedEndAt:end,evidenceRuleSnapshot:"NONE",evidenceRequired:false,evidenceTypeRequired:null,status:active?"IN_PROGRESS":"PENDING",actualStartAt:active?start:null,actualEndAt:null,actualDurationMinutes:null,actualDurationSeconds:null},create:{occurrenceId:o.id,taskId:task!.id,sequence:1,taskNameSnapshot:task!.name,taskDescriptionSnapshot:"<p>E2E deterministic Task.</p>",plannedDurationMinutes:30,plannedStartAt:start,plannedEndAt:end,evidenceRuleSnapshot:"NONE",evidenceRequired:false,status:active?"IN_PROGRESS":"PENDING",actualStartAt:active?start:null}});
    return{o,ot};
  }
  const a=await occurrence(scheduleA,workAreaA,propertyA,user.id,true),b=await occurrence(scheduleB,workAreaB,propertyB,null,false);
  let bNote=await prisma.scheduleOccurrenceNote.findFirst({where:{occurrenceId:b.o.id,note:"[E2E] Property B visibility report"}});
  if(!bNote)bNote=await prisma.scheduleOccurrenceNote.create({data:{occurrenceId:b.o.id,scope:"SCHEDULE",note:"[E2E] Property B visibility report",createdById:admin.id}});
  const bReport=await prisma.reportedWorkItem.upsert({where:{sourceNoteId:bNote.id},update:{propertyId:propertyB.id,workAreaId:workAreaB.id,status:"NEW",noteText:bNote.note,sourceScheduleName:scheduleB.name,reportedById:admin.id,dismissedAt:null,dismissedById:null,linkedScheduleId:null,scheduleLinkedAt:null,scheduleLinkedById:null},create:{organizationId:org.organizationId,propertyId:propertyB.id,workAreaId:workAreaB.id,sourceNoteId:bNote.id,noteScope:"SCHEDULE",noteText:bNote.note,sourceScheduleName:scheduleB.name,reportedById:admin.id,reportedAt:bNote.createdAt}});
  return NextResponse.json({workAreaA:{id:workAreaA.id},taskA:{id:task.id},occurrenceA:{id:a.o.id},occurrenceTaskA:{id:a.ot.id},propertyBReportId:bReport.id});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to prepare Reported Work fixture."},{status:400});}
}
