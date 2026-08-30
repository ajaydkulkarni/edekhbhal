import {redirect} from "next/navigation";
import {Nav} from "@/components/Nav";import{ScheduleEditor}from"@/components/ScheduleEditor";import{getSessionUser}from"@/lib/session";import{prisma}from"@/lib/prisma";import{assignedPropertyIds,canAccessProperty}from"@/lib/propertyAccess";
export default async function NewSchedulePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const user=await getSessionUser();if(!user)redirect("/login");
 const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});if(!membership)redirect("/onboarding");if(!["ADMIN","PROPERTY_MANAGER"].includes(membership.role))redirect("/schedules");
 const q=await searchParams,assignedIds=await assignedPropertyIds(membership),requestedReportId=(q.reportedWorkItemId||"").trim(),requestedWorkAreaId=(q.workAreaId||"").trim();
 const report=requestedReportId?await prisma.reportedWorkItem.findFirst({where:{id:requestedReportId,organizationId:membership.organizationId},include:{workArea:{include:{property:true}}}}):null;
 if(requestedReportId&&(!report||!(await canAccessProperty(membership,report.propertyId))))redirect("/reports/reported-work");
 if(report?.linkedScheduleId)redirect(`/schedules/${report.linkedScheduleId}`);
 const[workAreas,tasks]=await Promise.all([
  prisma.workArea.findMany({where:{status:"ACTIVE",property:{organizationId:membership.organizationId,status:"ACTIVE",...(assignedIds?{id:{in:assignedIds}}:{})}},include:{property:true},orderBy:[{property:{name:"asc"}},{name:"asc"}]}),
  prisma.task.findMany({where:{organizationId:membership.organizationId,status:"ACTIVE"},orderBy:{name:"asc"}})
 ]);
 const allowed=new Set(workAreas.map(w=>w.id)),preferred=report?.workAreaId||requestedWorkAreaId,defaultWorkAreaId=preferred&&allowed.has(preferred)?preferred:undefined;
 const waOptions=workAreas.map(wa=>({id:wa.id,name:wa.name,propertyName:wa.property.name,timezone:wa.property.timezone||membership.organization.timezone,status:wa.status,propertyStatus:wa.property.status}));
 const taskOptions=tasks.map(task=>({id:task.id,name:task.name,status:task.status}));
 return <><Nav/><main className="container"><h1>Create Schedule</h1><p className="muted">{report?`Creating follow-up work for a ${report.noteScope==="TASK"?"Task":"Schedule"} note reported in ${report.workArea.name}. One Time is selected by default.`:"Only Admins and Property Managers can create or edit Schedules."}</p><ScheduleEditor canManage={true} workAreas={waOptions} tasks={taskOptions} defaults={{workAreaId:defaultWorkAreaId,reportedWorkItemId:report?.id,suggestedName:report?`Follow-up — ${report.workArea.name}`:undefined}}/></main></>;
}
