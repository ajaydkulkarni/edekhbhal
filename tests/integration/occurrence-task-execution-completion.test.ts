import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:10,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
const ids={org:"",userA:"",memberA:"",userB:"",memberB:"",site:"",wa:"",qr:"",task:""};
type Tx=postgres.TransactionSql<{}>;

async function ctx<T>(user:string,member:string,fn:(tx:Tx)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${user},true)`;
  await tx`select set_config('app.organization_id',${ids.org},true)`;
  await tx`select set_config('app.membership_id',${member},true)`;
  return fn(tx);
 }) as Promise<T>;
}
const asA=<T>(fn:(tx:Tx)=>Promise<T>)=>ctx(ids.userA,ids.memberA,fn);
const asB=<T>(fn:(tx:Tx)=>Promise<T>)=>ctx(ids.userB,ids.memberB,fn);

async function makeOccurrence(name:string,taskCount=2,evidenceFirst=false){
 const s=await migrator`insert into schedule_master(
   organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
 ) values(${ids.org},${ids.site},${ids.wa},${name},'ONE_TIME','2020-01-01','05:00','America/Denver','ACTIVE',false) returning id`;
 const scheduleId=s[0].id as string;
 for(let i=1;i<=taskCount;i++){
  await migrator`insert into schedule_task(
   organization_id,site_id,work_area_id,schedule_id,task_id,sequence,planned_duration_minutes,
   planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule
  ) values(${ids.org},${ids.site},${ids.wa},${scheduleId},${ids.task},${i},10,${(i-1)*10},${i*10},${evidenceFirst&&i===1?"PHOTO":"NONE"})`;
 }
 const o=await migrator`insert into schedule_occurrence(
  organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,status
 ) values(
  ${ids.org},${ids.site},${ids.wa},${scheduleId},'2020-01-01T12:00:00Z','2020-01-01T12:20:00Z',
  'America/Denver','2020-01-01','05:00',-420,'Task Exec Org','Task Exec Site','Task Exec Area',${name},
  1,${taskCount*10},
  '{"0":[{"start":"00:00","end":"24:00"}],"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}]}'::jsonb,
  'ORGANIZATION',false,'PENDING'
 ) returning id`;
 const occurrenceId=o[0].id as string;
 for(let i=1;i<=taskCount;i++){
  const evidence=evidenceFirst&&i===1;
  await migrator`insert into schedule_occurrence_task(
   organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
   sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
   evidence_rule_snapshot,evidence_required,required_evidence_type,status
  ) values(
   ${ids.org},${ids.site},${ids.wa},${occurrenceId},${ids.task},${`Exec Task ${i}`},${`<p>Step ${i}</p>`},
   ${i},10,${(i-1)*10},${i*10},${evidence?"PHOTO":"NONE"},${evidence},${evidence?"PHOTO":null},'PENDING'
  )`;
 }
 return{scheduleId,occurrenceId};
}

async function claimAndStart(occurrenceId:string){
 await asA(tx=>tx`select app_private.claim_occurrence(${occurrenceId},${crypto.randomUUID()},'API')`);
 await asA(tx=>tx`select app_private.start_occurrence_with_qr(${occurrenceId},${ids.qr},${crypto.randomUUID()},'API')`);
}

describe("Occurrence Task Execution & Completion database boundary",()=>{
 beforeAll(async()=>{
  const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rows=await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone)
    values(${`Task Exec Org ${x}`},'US','USD','America/Denver') returning id),
   ua as(insert into app_user(auth_subject,email,display_name) values(${`task-a-${x}`},${`task-a-${x}@example.test`},'Task A') returning id),
   ub as(insert into app_user(auth_subject,email,display_name) values(${`task-b-${x}`},${`task-b-${x}@example.test`},'Task B') returning id),
   ma as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ua.id,'USER' from o,ua returning id),
   mb as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ub.id,'USER' from o,ub returning id),
   s as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Task Exec Site','TES','America/Denver','US' from o returning id)
   select o.id org,ua.id ua,ub.id ub,ma.id ma,mb.id mb,s.id site from o,ua,ub,ma,mb,s`;
  const r=rows[0];Object.assign(ids,{org:r.org,userA:r.ua,userB:r.ub,memberA:r.ma,memberB:r.mb,site:r.site});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id)
    values(${ids.org},${ids.site},${ids.memberA}),(${ids.org},${ids.site},${ids.memberB})`;
  const wa=await migrator`insert into work_area(organization_id,site_id,name,code,status)
    values(${ids.org},${ids.site},'Task Exec Area','TEA','ACTIVE') returning id`;ids.wa=wa[0].id;
  const qr=await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status)
    values(${ids.org},${ids.site},${ids.wa},${`task-exec-qr-${x}`},'ACTIVE') returning public_token`;ids.qr=qr[0].public_token;
  const task=await migrator`insert into task_master(organization_id,name,instructions_html,status)
    values(${ids.org},'Reusable Exec Task','<p>Execute.</p>','ACTIVE') returning id`;ids.task=task[0].id;
 },20000);

 afterAll(async()=>{
  if(ids.org){
   await migrator`delete from audit_event where organization_id=${ids.org}`;
   await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence_evidence where organization_id=${ids.org}`;
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
  for(const u of[ids.userA,ids.userB])if(u)await migrator`delete from app_user where id=${u}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("starts only the first snapshotted Task and preserves sequence",async()=>{
  const item=await makeOccurrence("Sequential Start");
  await claimAndStart(item.occurrenceId);
  const tasks=await migrator`select sequence,status,started_at from schedule_occurrence_task where occurrence_id=${item.occurrenceId} order by sequence`;
  expect(tasks[0].status).toBe("IN_PROGRESS");expect(tasks[0].started_at).toBeTruthy();
  expect(tasks[1].status).toBe("PENDING");expect(tasks[1].started_at).toBeNull();
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("completes the current Task idempotently and server-starts the next Task",async()=>{
  const item=await makeOccurrence("Task Progression");
  await claimAndStart(item.occurrenceId);
  const first=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId} and sequence=1`)[0];
  const second=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId} and sequence=2`)[0];
  const key=crypto.randomUUID();
  await asA(tx=>tx`select app_private.complete_occurrence_task(${first.id},${first.version},'done safely',${key},'API')`);
  await asA(tx=>tx`select app_private.complete_occurrence_task(${first.id},${first.version},'done safely',${key},'API')`);
  const rows=await migrator`select id,status,started_at,completed_at,actual_duration_seconds,execution_notes from schedule_occurrence_task where id in(${first.id},${second.id}) order by sequence`;
  expect(rows[0]).toMatchObject({status:"COMPLETED",execution_notes:"done safely"});expect(rows[0].completed_at).toBeTruthy();expect(Number(rows[0].actual_duration_seconds)).toBeGreaterThanOrEqual(0);
  expect(rows[1].status).toBe("IN_PROGRESS");expect(rows[1].started_at).toBeTruthy();
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("blocks wrong-sequence and another membership execution",async()=>{
  const item=await makeOccurrence("Execution Guard");
  await claimAndStart(item.occurrenceId);
  const tasks=await migrator`select id,sequence,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId} order by sequence`;
  await expect(asA(tx=>tx`select app_private.complete_occurrence_task(${tasks[1].id},${tasks[1].version},null,${crypto.randomUUID()},'API')`)).rejects.toThrow(/current IN_PROGRESS Task/i);
  await expect(asB(tx=>tx`select app_private.complete_occurrence_task(${tasks[0].id},${tasks[0].version},null,${crypto.randomUUID()},'API')`)).rejects.toThrow(/active assigned membership/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("requires VERIFIED evidence of the snapshotted required type",async()=>{
  const item=await makeOccurrence("Evidence Gate",1,true);
  await claimAndStart(item.occurrenceId);
  const task=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId}`)[0];
  await expect(asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`)).rejects.toThrow(/Verified required evidence/i);
  await migrator`insert into schedule_occurrence_evidence(
   organization_id,site_id,work_area_id,occurrence_id,occurrence_task_id,evidence_type,object_key,
   content_type,byte_size,sha256_hex,verification_status,created_by_membership_id,verified_at
  ) values(
   ${ids.org},${ids.site},${ids.wa},${item.occurrenceId},${task.id},'PHOTO',${`verified/${crypto.randomUUID()}.jpg`},
   'image/jpeg',100,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','VERIFIED',${ids.memberA},now()
  )`;
  await asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`);
  const occ=(await migrator`select status,completed_at,actual_duration_seconds from schedule_occurrence where id=${item.occurrenceId}`)[0];
  expect(occ.status).toBe("COMPLETED");expect(occ.completed_at).toBeTruthy();expect(Number(occ.actual_duration_seconds)).toBeGreaterThanOrEqual(0);
 });

 it("completes the last Task and derives terminal Occurrence status server-side",async()=>{
  const item=await makeOccurrence("Derived Complete",2,false);
  await claimAndStart(item.occurrenceId);
  let task=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId} and sequence=1`)[0];
  await asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`);
  task=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId} and sequence=2`)[0];
  await asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`);
  const occ=(await migrator`select status,completed_at,completion_reason from schedule_occurrence where id=${item.occurrenceId}`)[0];
  expect(occ).toMatchObject({status:"COMPLETED",completion_reason:null});expect(occ.completed_at).toBeTruthy();
 });

 it("supports explicit PARTIALLY_COMPLETED only after at least one Task completes",async()=>{
  const item=await makeOccurrence("Partial Complete",2,false);
  await claimAndStart(item.occurrenceId);
  let occ=(await migrator`select version from schedule_occurrence where id=${item.occurrenceId}`)[0];
  await expect(asA(tx=>tx`select app_private.partially_complete_occurrence(${item.occurrenceId},${occ.version},'cannot finish',${crypto.randomUUID()},'API')`)).rejects.toThrow(/At least one Task/i);
  const first=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId} and sequence=1`)[0];
  await asA(tx=>tx`select app_private.complete_occurrence_task(${first.id},${first.version},null,${crypto.randomUUID()},'API')`);
  occ=(await migrator`select version from schedule_occurrence where id=${item.occurrenceId}`)[0];
  await asA(tx=>tx`select app_private.partially_complete_occurrence(${item.occurrenceId},${occ.version},'area became unavailable',${crypto.randomUUID()},'API')`);
  const final=(await migrator`select status,completion_reason,completed_at from schedule_occurrence where id=${item.occurrenceId}`)[0];
  expect(final).toMatchObject({status:"PARTIALLY_COMPLETED",completion_reason:"area became unavailable"});expect(final.completed_at).toBeTruthy();
  const tasks=await migrator`select sequence,status from schedule_occurrence_task where occurrence_id=${item.occurrenceId} order by sequence`;
  expect(tasks.map(t=>t.status)).toEqual(["COMPLETED","CANCELED"]);
 });

 it("releases active-work exclusivity only after a terminal transition",async()=>{
  const done=await makeOccurrence("Release Lock",1,false);
  await claimAndStart(done.occurrenceId);
  const task=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${done.occurrenceId}`)[0];
  const waiting=await makeOccurrence("Waiting Work",1,false);
  await expect(asA(tx=>tx`select app_private.claim_occurrence(${waiting.occurrenceId},${crypto.randomUUID()},'API')`)).rejects.toThrow(/another active work item/i);
  await asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`);
  await asA(tx=>tx`select app_private.claim_occurrence(${waiting.occurrenceId},${crypto.randomUUID()},'API')`);
  expect((await migrator`select assigned_membership_id from schedule_occurrence where id=${waiting.occurrenceId}`)[0].assigned_membership_id).toBe(ids.memberA);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${waiting.occurrenceId}`;
 });

 it("serializes concurrent completion so one command wins",async()=>{
  const item=await makeOccurrence("Concurrent Completion",1,false);
  await claimAndStart(item.occurrenceId);
  const task=(await migrator`select id,version from schedule_occurrence_task where occurrence_id=${item.occurrenceId}`)[0];
  const settled=await Promise.allSettled([
   asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`),
   asA(tx=>tx`select app_private.complete_occurrence_task(${task.id},${task.version},null,${crypto.randomUUID()},'API')`)
  ]);
  expect(settled.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(settled.filter(x=>x.status==="rejected")).toHaveLength(1);
  expect((await migrator`select status from schedule_occurrence where id=${item.occurrenceId}`)[0].status).toBe("COMPLETED");
 });

 it("keeps direct runtime evidence/Occurrence DML closed and audits Task/terminal events",async()=>{
  await expect(asA(tx=>tx`insert into schedule_occurrence_evidence(
   organization_id,site_id,work_area_id,occurrence_id,occurrence_task_id,evidence_type,object_key,created_by_membership_id
  ) values(${ids.org},${ids.site},${ids.wa},${crypto.randomUUID()},${crypto.randomUUID()},'PHOTO','blocked',${ids.memberA})`)).rejects.toThrow(/permission denied/i);
  await expect(asA(tx=>tx`update schedule_occurrence_task set execution_notes='blocked' where organization_id=${ids.org}`)).rejects.toThrow(/permission denied/i);
  const actions=(await migrator`select action_code from audit_event where organization_id=${ids.org} order by timestamp_utc`).map(r=>r.action_code);
  expect(actions).toContain("OCCURRENCE_TASK_STARTED");
  expect(actions).toContain("OCCURRENCE_TASK_COMPLETED");
  expect(actions).toContain("OCCURRENCE_COMPLETED");
  expect(actions).toContain("OCCURRENCE_PARTIALLY_COMPLETED");
 });
});
