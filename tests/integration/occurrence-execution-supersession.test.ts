import postgres from "postgres";
import {afterAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:8,prepare:false,ssl:"require"}),migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
const ids={org:"",userA:"",memberA:"",userB:"",memberB:"",managerUser:"",managerMember:"",site:"",wa:"",qrToken:"",task:"",schedule:""};

async function ctx<T>(user:string,member:string,fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${user},true)`;
  await tx`select set_config('app.organization_id',${ids.org},true)`;
  await tx`select set_config('app.membership_id',${member},true)`;
  return fn(tx);
 }) as Promise<T>;
}
const asA=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>ctx(ids.userA,ids.memberA,fn);
const asB=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>ctx(ids.userB,ids.memberB,fn);
const asManager=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>ctx(ids.managerUser,ids.managerMember,fn);

async function makeOccurrence(name:string,start:string,supersede=true){
 const s=await migrator`insert into schedule_master(
   organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
 ) values(
   ${ids.org},${ids.site},${ids.wa},${name},'ONE_TIME','2020-09-03','08:00','America/Denver','ACTIVE',${supersede}
 ) returning id`;
 const scheduleId=s[0].id;
 await migrator`insert into schedule_task(
  organization_id,site_id,work_area_id,schedule_id,task_id,sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule
 ) values(${ids.org},${ids.site},${ids.wa},${scheduleId},${ids.task},1,10,0,10,'NONE')`;
 const o=await migrator`insert into schedule_occurrence(
  organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,status
 ) values(
  ${ids.org},${ids.site},${ids.wa},${scheduleId},${start}::timestamptz,${start}::timestamptz+interval '10 minutes',
  'America/Denver','2020-09-03','08:00',-360,'Execution Org','Execution Site','Main Lobby',${name},
  1,10,'{"0":[{"start":"00:00","end":"24:00"}],"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}]}'::jsonb,'ORGANIZATION',${supersede},'PENDING'
 ) returning id`;
 await migrator`insert into schedule_occurrence_task(
  organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
  sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
  evidence_rule_snapshot,evidence_required,status
 ) values(${ids.org},${ids.site},${ids.wa},${o[0].id},${ids.task},'Execution Task','<p>Do it.</p>',1,10,0,10,'NONE',false,'PENDING')`;
 return{scheduleId,occurrenceId:o[0].id};
}

describe("Occurrence Execution & Supersession database boundary",()=>{
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
  for(const u of[ids.userA,ids.userB,ids.managerUser])if(u)await migrator`delete from app_user where id=${u}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("creates two scoped USER memberships, manager, active Work Area/QR, and Task",async()=>{
  const x=Date.now().toString();
  const rows=await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone) values(${`Execution Org ${x}`},'US','USD','America/Denver') returning id),
   ua as(insert into app_user(auth_subject,email,display_name) values(${`exec-a-${x}`},${`a-${x}@example.test`},'Exec A') returning id),
   ub as(insert into app_user(auth_subject,email,display_name) values(${`exec-b-${x}`},${`b-${x}@example.test`},'Exec B') returning id),
   mu as(insert into app_user(auth_subject,email,display_name) values(${`exec-m-${x}`},${`m-${x}@example.test`},'Manager') returning id),
   ma as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ua.id,'USER' from o,ua returning id),
   mb as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ub.id,'USER' from o,ub returning id),
   mm as(insert into organization_membership(organization_id,user_id,role_code) select o.id,mu.id,'SITE_MANAGER' from o,mu returning id),
   s as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Execution Site','EXEC','America/Denver','US' from o returning id)
   select o.id org,ua.id ua,ub.id ub,mu.id mu,ma.id ma,mb.id mb,mm.id mm,s.id site from o,ua,ub,mu,ma,mb,mm,s`;
  const r=rows[0];Object.assign(ids,{org:r.org,userA:r.ua,userB:r.ub,managerUser:r.mu,memberA:r.ma,memberB:r.mb,managerMember:r.mm,site:r.site});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id) values(${ids.org},${ids.site},${ids.memberA}),(${ids.org},${ids.site},${ids.memberB}),(${ids.org},${ids.site},${ids.managerMember})`;
  const wa=await migrator`insert into work_area(organization_id,site_id,name,code,status) values(${ids.org},${ids.site},'Main Lobby','LOBBY','ACTIVE') returning id`;ids.wa=wa[0].id;
  const qr=await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status) values(${ids.org},${ids.site},${ids.wa},${`exec-token-${x}`},'ACTIVE') returning public_token`;ids.qrToken=qr[0].public_token;
  const task=await migrator`insert into task_master(organization_id,name,instructions_html,status) values(${ids.org},'Execution Task','<p>Do it.</p>','ACTIVE') returning id`;ids.task=task[0].id;
  expect(ids.qrToken).toBeTruthy();
 });

 it("allows USER to claim open work idempotently and blocks another membership",async()=>{
  const item=await makeOccurrence("Claim Test","2020-09-03T16:00:00Z",false);
  const key=crypto.randomUUID();
  const first=await asA(tx=>tx<{id:string}[]>`select app_private.claim_occurrence(${item.occurrenceId},${key},'API') id`);
  const second=await asA(tx=>tx<{id:string}[]>`select app_private.claim_occurrence(${item.occurrenceId},${key},'API') id`);
  expect(first[0].id).toBe(item.occurrenceId);expect(second[0].id).toBe(item.occurrenceId);
  await expect(asB(tx=>tx`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/assigned to another/i);
 });

 it("enforces active-work exclusivity per Organization Membership",async()=>{
  const held=await makeOccurrence("Held Work","2020-09-03T16:10:00Z",false);
  await expect(asA(tx=>tx`select app_private.claim_occurrence(${held.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/another active work item/i);
  const bWork=await makeOccurrence("B Work","2020-09-03T16:20:00Z",false);
  await asB(tx=>tx`select app_private.claim_occurrence(${bWork.occurrenceId},${crypto.randomUUID()},'API')`);
  expect((await migrator`select assigned_membership_id from schedule_occurrence where id=${bWork.occurrenceId}`)[0].assigned_membership_id).toBe(ids.memberB);
 });

 it("requires the exact active Work Area QR and starts server-authoritatively",async()=>{
  const claimRow=(await migrator`select id from schedule_occurrence where assigned_membership_id=${ids.memberA} and claimed_at is not null and status='PENDING' order by created_at limit 1`)[0];
  await expect(asA(tx=>tx`select app_private.start_occurrence_with_qr(${claimRow.id},'wrong-token',${crypto.randomUUID()},'API')`)).rejects.toThrow(/QR/i);
  await asA(tx=>tx`select app_private.start_occurrence_with_qr(${claimRow.id},${ids.qrToken},${crypto.randomUUID()},'API')`);
  const started=(await migrator`select status,started_at from schedule_occurrence where id=${claimRow.id}`)[0];
  expect(started.status).toBe("IN_PROGRESS");expect(started.started_at).toBeTruthy();
  const task=(await migrator`select status,started_at from schedule_occurrence_task where occurrence_id=${claimRow.id}`)[0];
  expect(task.status).toBe("IN_PROGRESS");expect(task.started_at).toBeTruthy();
 });

 it("latest due wins: releases and MISSES older claimed-but-unstarted work without touching IN_PROGRESS history",async()=>{
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where assigned_membership_id=${ids.memberB} and status='PENDING'`;

  const older=await makeOccurrence("Supersession Series","2020-09-03T15:00:00Z",true);
  ids.schedule=older.scheduleId;
  const newer=await migrator`insert into schedule_occurrence(
   organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
   timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
   organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
   schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
   supersede_unstarted_snapshot,status
  )
  select organization_id,site_id,work_area_id,schedule_id,'2020-09-03T16:00:00Z','2020-09-03T16:10:00Z',
   timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
   organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
   schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,true,'PENDING'
  from schedule_occurrence where id=${older.occurrenceId} returning id`;
  await migrator`insert into schedule_occurrence_task(
   organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
   sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule_snapshot,evidence_required,status
  ) select organization_id,site_id,work_area_id,${newer[0].id},task_id,task_name_snapshot,task_instructions_snapshot,
   sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule_snapshot,evidence_required,'PENDING'
  from schedule_occurrence_task where occurrence_id=${older.occurrenceId}`;

  await migrator`update schedule_occurrence set assigned_membership_id=${ids.memberB},claimed_at=now() where id=${older.occurrenceId}`;
  await asB(tx=>tx`select app_private.apply_due_supersession('API')`);
  const oldRow=(await migrator`select status,assigned_membership_id,claimed_at,miss_reason from schedule_occurrence where id=${older.occurrenceId}`)[0];
  expect(oldRow).toMatchObject({status:"MISSED",assigned_membership_id:null,claimed_at:null,miss_reason:"SUPERSEDED_BY_LATER_DUE"});
  expect((await migrator`select status from schedule_occurrence_task where occurrence_id=${older.occurrenceId}`)[0].status).toBe("MISSED");

  const inProgress=(await migrator`select id,status from schedule_occurrence where assigned_membership_id=${ids.memberA} and status='IN_PROGRESS'`)[0];
  await asA(tx=>tx`select app_private.apply_due_supersession('API')`);
  expect((await migrator`select status from schedule_occurrence where id=${inProgress.id}`)[0].status).toBe("IN_PROGRESS");
 });

 it("keeps management read scope but USER sees only open or own executable work",async()=>{
  const managerRows=await asManager(tx=>tx`select id from schedule_occurrence`);
  expect(managerRows.length).toBeGreaterThan(0);
  const userRows=await asA(tx=>tx`select id,status,assigned_membership_id from schedule_occurrence`);
  expect(userRows.every(r=>r.assigned_membership_id===null||r.assigned_membership_id===ids.memberA)).toBe(true);
 });

 it("audits claim, start, and supersession command actions",async()=>{
  const rows=await migrator`select action_code from audit_event where organization_id=${ids.org} and module_code='OCCURRENCE' order by timestamp_utc`;
  const actions=rows.map(r=>r.action_code);
  expect(actions).toContain("OCCURRENCE_CLAIMED");
  expect(actions).toContain("OCCURRENCE_STARTED");
  expect(actions).toContain("OCCURRENCE_SUPERSEDED");
 });
});
