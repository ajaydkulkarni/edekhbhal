import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:12,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});

const ids={
 org:"",otherOrg:"",
 userA:"",memberA:"",userB:"",memberB:"",managerUser:"",managerMember:"",adminUser:"",adminMember:"",
 siteA:"",siteB:"",waA:"",waB:"",qrA:"",qrAOld:"",qrB:"",task:""
};

type Tx=postgres.TransactionSql<{}>;

async function ctx<T>(user:string,org:string,member:string,fn:(tx:Tx)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${user},true)`;
  await tx`select set_config('app.organization_id',${org},true)`;
  await tx`select set_config('app.membership_id',${member},true)`;
  return fn(tx);
 }) as Promise<T>;
}
const asA=<T>(fn:(tx:Tx)=>Promise<T>)=>ctx(ids.userA,ids.org,ids.memberA,fn);
const asB=<T>(fn:(tx:Tx)=>Promise<T>)=>ctx(ids.userB,ids.org,ids.memberB,fn);
const asManager=<T>(fn:(tx:Tx)=>Promise<T>)=>ctx(ids.managerUser,ids.org,ids.managerMember,fn);
const asAdmin=<T>(fn:(tx:Tx)=>Promise<T>)=>ctx(ids.adminUser,ids.org,ids.adminMember,fn);

async function makeOccurrence(opts:{
 name:string;siteId?:string;waId?:string;start?:string;supersede?:boolean;
 scheduleStatus?:"ACTIVE"|"INACTIVE";
}){
 const siteId=opts.siteId??ids.siteA,waId=opts.waId??ids.waA;
 const start=opts.start??"2020-01-01T12:00:00Z",supersede=opts.supersede??false;
 const schedule=await migrator`insert into schedule_master(
  organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
 ) values(
  ${ids.org},${siteId},${waId},${opts.name},'ONE_TIME','2020-01-01','05:00','America/Denver',${opts.scheduleStatus??"ACTIVE"},${supersede}
 ) returning id`;
 const scheduleId=schedule[0].id;
 await migrator`insert into schedule_task(
  organization_id,site_id,work_area_id,schedule_id,task_id,sequence,planned_duration_minutes,
  planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule
 ) values(${ids.org},${siteId},${waId},${scheduleId},${ids.task},1,10,0,10,'NONE')`;
 const occurrence=await migrator`insert into schedule_occurrence(
  organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,status
 ) values(
  ${ids.org},${siteId},${waId},${scheduleId},${start}::timestamptz,${start}::timestamptz+interval '10 minutes',
  'America/Denver','2020-01-01','05:00',-420,'Hardening Org','Hardening Site','Hardening Area',${opts.name},
  1,10,'{"0":[{"start":"00:00","end":"24:00"}],"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}]}'::jsonb,
  'ORGANIZATION',${supersede},'PENDING'
 ) returning id`;
 await migrator`insert into schedule_occurrence_task(
  organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
  sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
  evidence_rule_snapshot,evidence_required,status
 ) values(
  ${ids.org},${siteId},${waId},${occurrence[0].id},${ids.task},'Hardening Task','<p>Execute safely.</p>',
  1,10,0,10,'NONE',false,'PENDING'
 )`;
 return{scheduleId,occurrenceId:occurrence[0].id};
}

async function cloneOccurrence(scheduleId:string,sourceOccurrenceId:string,start:string){
 const o=await migrator`insert into schedule_occurrence(
  organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,status
 )
 select organization_id,site_id,work_area_id,${scheduleId},${start}::timestamptz,${start}::timestamptz+interval '10 minutes',
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,'PENDING'
 from schedule_occurrence where id=${sourceOccurrenceId}
 returning id`;
 await migrator`insert into schedule_occurrence_task(
  organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
  sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
  evidence_rule_snapshot,evidence_required,status
 )
 select organization_id,site_id,work_area_id,${o[0].id},task_id,task_name_snapshot,task_instructions_snapshot,
  sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
  evidence_rule_snapshot,evidence_required,'PENDING'
 from schedule_occurrence_task where occurrence_id=${sourceOccurrenceId}`;
 return o[0].id as string;
}

describe("Occurrence Execution Security Hardening 01",()=>{
 beforeAll(async()=>{
  const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rows=await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone)
     values(${`Hardening Org ${x}`},'US','USD','America/Denver') returning id),
   oo as(insert into organization(name,country_code,default_currency_code,default_timezone)
     values(${`Other Org ${x}`},'US','USD','America/Denver') returning id),
   ua as(insert into app_user(auth_subject,email,display_name) values(${`hard-a-${x}`},${`hard-a-${x}@example.test`},'Hard A') returning id),
   ub as(insert into app_user(auth_subject,email,display_name) values(${`hard-b-${x}`},${`hard-b-${x}@example.test`},'Hard B') returning id),
   um as(insert into app_user(auth_subject,email,display_name) values(${`hard-m-${x}`},${`hard-m-${x}@example.test`},'Hard Manager') returning id),
   ud as(insert into app_user(auth_subject,email,display_name) values(${`hard-d-${x}`},${`hard-d-${x}@example.test`},'Hard Admin') returning id),
   ma as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ua.id,'USER' from o,ua returning id),
   mb as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ub.id,'USER' from o,ub returning id),
   mm as(insert into organization_membership(organization_id,user_id,role_code) select o.id,um.id,'SITE_MANAGER' from o,um returning id),
   md as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ud.id,'ADMIN' from o,ud returning id),
   sa as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Hard Site A','HSA','America/Denver','US' from o returning id),
   sb as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Hard Site B','HSB','America/Denver','US' from o returning id)
   select o.id org,oo.id other_org,ua.id ua,ub.id ub,um.id um,ud.id ud,ma.id ma,mb.id mb,mm.id mm,md.id md,sa.id sa,sb.id sb
   from o,oo,ua,ub,um,ud,ma,mb,mm,md,sa,sb`;
  const r=rows[0];
  Object.assign(ids,{org:r.org,otherOrg:r.other_org,userA:r.ua,userB:r.ub,managerUser:r.um,adminUser:r.ud,
   memberA:r.ma,memberB:r.mb,managerMember:r.mm,adminMember:r.md,siteA:r.sa,siteB:r.sb});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id) values
   (${ids.org},${ids.siteA},${ids.memberA}),
   (${ids.org},${ids.siteA},${ids.memberB}),
   (${ids.org},${ids.siteA},${ids.managerMember})`;
  const waA=await migrator`insert into work_area(organization_id,site_id,name,code,status)
   values(${ids.org},${ids.siteA},'Hard Area A','HAA','ACTIVE') returning id`;
  const waB=await migrator`insert into work_area(organization_id,site_id,name,code,status)
   values(${ids.org},${ids.siteB},'Hard Area B','HAB','ACTIVE') returning id`;
  ids.waA=waA[0].id;ids.waB=waB[0].id;
  const qrA=await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status)
   values(${ids.org},${ids.siteA},${ids.waA},${`hard-qr-a-${x}`},'ACTIVE') returning public_token`;ids.qrA=qrA[0].public_token;
  const old=await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status,revoked_at)
   values(${ids.org},${ids.siteA},${ids.waA},${`hard-qr-old-${x}`},'REVOKED',now()) returning public_token`;ids.qrAOld=old[0].public_token;
  const qrB=await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status)
   values(${ids.org},${ids.siteB},${ids.waB},${`hard-qr-b-${x}`},'ACTIVE') returning public_token`;ids.qrB=qrB[0].public_token;
  const task=await migrator`insert into task_master(organization_id,name,instructions_html,status)
   values(${ids.org},'Hardening Task','<p>Execute safely.</p>','ACTIVE') returning id`;ids.task=task[0].id;
 });

 afterAll(async()=>{
  if(ids.org){
   await migrator`delete from audit_event where organization_id=${ids.org}`;
   await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence_task where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence where organization_id=${ids.org}`;
   await migrator`delete from schedule_task where organization_id=${ids.org}`;
   await migrator`delete from schedule_master where organization_id=${ids.org}`;
   await migrator`delete from task_master where organization_id=${ids.org}`;
   await migrator`delete from work_area_qr where organization_id=${ids.org}`;
   await migrator`delete from work_area where organization_id=${ids.org}`;
   await migrator`delete from site_membership_scope where organization_id=${ids.org}`;
   await migrator`delete from organization_membership where organization_id=${ids.org}`;
   await migrator`delete from site where organization_id=${ids.org}`;
   await migrator`delete from organization where id=${ids.org}`;
  }
  if(ids.otherOrg)await migrator`delete from organization where id=${ids.otherOrg}`;
  for(const u of[ids.userA,ids.userB,ids.managerUser,ids.adminUser])if(u)await migrator`delete from app_user where id=${u}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("fails closed without tenant context and for cross-Organization targets",async()=>{
  const item=await makeOccurrence({name:"No Context"});
  await expect(runtime`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`).rejects.toThrow(/Active tenant context/i);
  await expect(runtime`select app_private.start_occurrence_with_qr(${item.occurrenceId},${ids.qrA},${crypto.randomUUID()},'API')`).rejects.toThrow(/Active tenant context/i);
  await expect(runtime`select app_private.apply_due_supersession('API')`).rejects.toThrow(/Active tenant context/i);

  await expect(ctx(ids.userA,ids.otherOrg,ids.memberA,tx=>tx`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`))
   .rejects.toThrow(/Active tenant context|Occurrence not found/i);
 });

 it("blocks USER commands outside Site scope and blocks management roles from USER commands",async()=>{
  const siteB=await makeOccurrence({name:"Other Site",siteId:ids.siteB,waId:ids.waB});
  await expect(asA(tx=>tx`select app_private.claim_occurrence(${siteB.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/Site scope/i);

  const open=await makeOccurrence({name:"Role Gate"});
  await expect(asManager(tx=>tx`select app_private.claim_occurrence(${open.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/USER role/i);
  await expect(asAdmin(tx=>tx`select app_private.claim_occurrence(${open.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/USER role/i);
  await expect(asManager(tx=>tx`select app_private.start_occurrence_with_qr(${open.occurrenceId},${ids.qrA},${crypto.randomUUID()},'API')`)).rejects.toThrow(/USER role/i);
 });

 it("keeps direct DML and internal helpers unavailable to runtime",async()=>{
  await expect(asA(tx=>tx`update schedule_occurrence set status='MISSED' where organization_id=${ids.org}`)).rejects.toThrow(/permission denied/i);
  await expect(asA(tx=>tx`update schedule_occurrence_task set status='MISSED' where organization_id=${ids.org}`)).rejects.toThrow(/permission denied/i);
  await expect(asA(tx=>tx`select app_private.supersede_older_due_occurrences_internal(${crypto.randomUUID()},now(),'API')`)).rejects.toThrow(/permission denied/i);
  await expect(asA(tx=>tx`select app_private.audit_execution_event('X',${crypto.randomUUID()},null,null,null,'API')`)).rejects.toThrow(/permission denied/i);
 });

 it("rejects assigned-to-another-user even through SECURITY DEFINER and rejects idempotency-key reuse for another occurrence",async()=>{
  const assigned=await makeOccurrence({name:"Assigned Elsewhere"});
  await migrator`update schedule_occurrence set assigned_membership_id=${ids.memberB} where id=${assigned.occurrenceId}`;
  await expect(asA(tx=>tx`select app_private.claim_occurrence(${assigned.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/assigned to another/i);

  const one=await makeOccurrence({name:"Idempotency One"});
  const two=await makeOccurrence({name:"Idempotency Two"});
  const key=crypto.randomUUID();
  await asA(tx=>tx`select app_private.claim_occurrence(${one.occurrenceId},${key},'API')`);
  await expect(asA(tx=>tx`select app_private.claim_occurrence(${two.occurrenceId},${key},'API')`)).rejects.toThrow(/another claim/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${one.occurrenceId}`;
 });

 it("serializes concurrent same-occurrence claims so only one membership wins",async()=>{
  const item=await makeOccurrence({name:"Concurrent Same"});
  const settled=await Promise.allSettled([
   asA(tx=>tx`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`),
   asB(tx=>tx`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`)
  ]);
  expect(settled.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(settled.filter(x=>x.status==="rejected")).toHaveLength(1);
  const row=(await migrator`select assigned_membership_id,claimed_at from schedule_occurrence where id=${item.occurrenceId}`)[0];
  expect([ids.memberA,ids.memberB]).toContain(row.assigned_membership_id);expect(row.claimed_at).toBeTruthy();
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("serializes concurrent different-occurrence claims for one membership",async()=>{
  const a=await makeOccurrence({name:"Concurrent A"}),b=await makeOccurrence({name:"Concurrent B"});
  const settled=await Promise.allSettled([
   asA(tx=>tx`select app_private.claim_occurrence(${a.occurrenceId},${crypto.randomUUID()},'API')`),
   asA(tx=>tx`select app_private.claim_occurrence(${b.occurrenceId},${crypto.randomUUID()},'API')`)
  ]);
  expect(settled.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(settled.filter(x=>x.status==="rejected")).toHaveLength(1);
  const held=await migrator`select id from schedule_occurrence
   where organization_id=${ids.org} and assigned_membership_id=${ids.memberA} and claimed_at is not null and status='PENDING'
   and id in (${a.occurrenceId},${b.occurrenceId})`;
  expect(held).toHaveLength(1);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${held[0].id}`;
 });

 it("rejects revoked QR and another Work Area QR",async()=>{
  const revoked=await makeOccurrence({name:"Revoked QR"});
  await asA(tx=>tx`select app_private.claim_occurrence(${revoked.occurrenceId},${crypto.randomUUID()},'API')`);
  await expect(asA(tx=>tx`select app_private.start_occurrence_with_qr(${revoked.occurrenceId},${ids.qrAOld},${crypto.randomUUID()},'API')`)).rejects.toThrow(/QR/i);
  await expect(asA(tx=>tx`select app_private.start_occurrence_with_qr(${revoked.occurrenceId},${ids.qrB},${crypto.randomUUID()},'API')`)).rejects.toThrow(/QR/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${revoked.occurrenceId}`;
 });

 it("blocks start when the Work Area becomes inactive after claim",async()=>{
  const inactive=await makeOccurrence({name:"Inactive Parent"});
  await asA(tx=>tx`select app_private.claim_occurrence(${inactive.occurrenceId},${crypto.randomUUID()},'API')`);
  await migrator`update work_area set status='INACTIVE' where id=${ids.waA}`;
  try{
   await expect(asA(tx=>tx`select app_private.start_occurrence_with_qr(${inactive.occurrenceId},${ids.qrA},${crypto.randomUUID()},'API')`)).rejects.toThrow(/no longer active/i);
  }finally{
   await migrator`update work_area set status='ACTIVE' where id=${ids.waA}`;
   await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${inactive.occurrenceId}`;
  }
 });

 it("blocks start when the Schedule becomes inactive after claim",async()=>{
  const inactiveSchedule=await makeOccurrence({name:"Inactive Schedule"});
  await asA(tx=>tx`select app_private.claim_occurrence(${inactiveSchedule.occurrenceId},${crypto.randomUUID()},'API')`);
  await migrator`update schedule_master set status='INACTIVE' where id=${inactiveSchedule.scheduleId}`;
  await expect(asA(tx=>tx`select app_private.start_occurrence_with_qr(${inactiveSchedule.occurrenceId},${ids.qrA},${crypto.randomUUID()},'API')`)).rejects.toThrow(/no longer active/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${inactiveSchedule.occurrenceId}`;
 });

 it("supersedes only due unstarted PENDING rows of the same enabled Schedule",async()=>{
  const enabled=await makeOccurrence({name:"Enabled Supersession",start:"2020-01-01T10:00:00Z",supersede:true});
  const enabledNew=await cloneOccurrence(enabled.scheduleId,enabled.occurrenceId,"2020-01-01T11:00:00Z");
  const disabled=await makeOccurrence({name:"Disabled Supersession",start:"2020-01-01T10:00:00Z",supersede:false});
  await cloneOccurrence(disabled.scheduleId,disabled.occurrenceId,"2020-01-01T11:00:00Z");
  const future=await cloneOccurrence(enabled.scheduleId,enabled.occurrenceId,"2099-01-01T11:00:00Z");

  await asA(tx=>tx`select app_private.apply_due_supersession('API')`);

  const rows=await migrator`select id,status,miss_reason from schedule_occurrence where id in(
   ${enabled.occurrenceId},${enabledNew},${disabled.occurrenceId},${future})`;
  const byId=new Map(rows.map(r=>[r.id,r]));
  expect(byId.get(enabled.occurrenceId)?.status).toBe("MISSED");
  expect(byId.get(enabled.occurrenceId)?.miss_reason).toBe("SUPERSEDED_BY_LATER_DUE");
  expect(byId.get(enabledNew)?.status).toBe("PENDING");
  expect(byId.get(disabled.occurrenceId)?.status).toBe("PENDING");
  expect(byId.get(future)?.status).toBe("PENDING");
 });

 it("releases claimed-but-unstarted superseded work but never releases IN_PROGRESS",async()=>{
  const series=await makeOccurrence({name:"Claim Release Series",start:"2020-01-02T10:00:00Z",supersede:true});
  await cloneOccurrence(series.scheduleId,series.occurrenceId,"2020-01-02T11:00:00Z");
  await migrator`update schedule_occurrence set assigned_membership_id=${ids.memberA},claimed_at=now() where id=${series.occurrenceId}`;
  await asA(tx=>tx`select app_private.apply_due_supersession('API')`);
  const released=(await migrator`select status,assigned_membership_id,claimed_at from schedule_occurrence where id=${series.occurrenceId}`)[0];
  expect(released).toMatchObject({status:"MISSED",assigned_membership_id:null,claimed_at:null});

  const progress=await makeOccurrence({name:"In Progress Series",start:"2020-01-03T10:00:00Z",supersede:true});
  await cloneOccurrence(progress.scheduleId,progress.occurrenceId,"2020-01-03T11:00:00Z");
  await migrator`update schedule_occurrence set status='IN_PROGRESS',assigned_membership_id=${ids.memberA},claimed_at=now(),started_at=now() where id=${progress.occurrenceId}`;
  await asA(tx=>tx`select app_private.apply_due_supersession('API')`);
  const preserved=(await migrator`select status,assigned_membership_id,started_at from schedule_occurrence where id=${progress.occurrenceId}`)[0];
  expect(preserved.status).toBe("IN_PROGRESS");expect(preserved.assigned_membership_id).toBe(ids.memberA);expect(preserved.started_at).toBeTruthy();
 });

 it("attributes execution audit to the active Organization, User, and Membership",async()=>{
  // Clear active work from preceding IN_PROGRESS fixture so this claim is isolated.
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where organization_id=${ids.org} and assigned_membership_id=${ids.memberA} and status='IN_PROGRESS'`;
  const item=await makeOccurrence({name:"Audit Attribution"});
  await asA(tx=>tx`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`);
  const audit=(await migrator`select organization_id,actor_user_id,actor_membership_id,action_code
   from audit_event where organization_id=${ids.org} and entity_id=${item.occurrenceId}::text and action_code='OCCURRENCE_CLAIMED'
   order by timestamp_utc desc limit 1`)[0];
  expect(audit).toMatchObject({organization_id:ids.org,actor_user_id:ids.userA,actor_membership_id:ids.memberA,action_code:"OCCURRENCE_CLAIMED"});
 });
});
