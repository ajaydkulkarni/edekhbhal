import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:8,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
type Tx=postgres.TransactionSql<{}>;
const ids={org:"",userA:"",memberA:"",subjectA:"",userB:"",memberB:"",subjectB:"",site:"",wa:"",qr:"",task:""};

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

async function makeOccurrence(name:string,evidenceRequired=true){
 const s=await migrator`insert into schedule_master(
  organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
 ) values(${ids.org},${ids.site},${ids.wa},${name},'ONE_TIME','2020-01-01','05:00','America/Denver','ACTIVE',false) returning id`;
 const scheduleId=s[0].id as string;
 await migrator`insert into schedule_task(
  organization_id,site_id,work_area_id,schedule_id,task_id,sequence,planned_duration_minutes,
  planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule
 ) values(${ids.org},${ids.site},${ids.wa},${scheduleId},${ids.task},1,10,0,10,${evidenceRequired?"PHOTO":"NONE"})`;
 const o=await migrator`insert into schedule_occurrence(
  organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,status
 ) values(
  ${ids.org},${ids.site},${ids.wa},${scheduleId},'2020-01-01T12:00:00Z','2020-01-01T12:10:00Z',
  'America/Denver','2020-01-01','05:00',-420,'Evidence Org','Evidence Site','Evidence Area',${name},
  1,10,
  '{"0":[{"start":"00:00","end":"24:00"}],"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}]}'::jsonb,
  'ORGANIZATION',false,'PENDING'
 ) returning id`;
 const occurrenceId=o[0].id as string;
 const t=await migrator`insert into schedule_occurrence_task(
  organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
  sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
  evidence_rule_snapshot,evidence_required,required_evidence_type,status
 ) values(
  ${ids.org},${ids.site},${ids.wa},${occurrenceId},${ids.task},'Capture evidence','<p>Capture.</p>',
  1,10,0,10,${evidenceRequired?"PHOTO":"NONE"},${evidenceRequired},${evidenceRequired?"PHOTO":null},'PENDING'
 ) returning id`;
 return{occurrenceId,taskId:t[0].id as string};
}

async function start(item:{occurrenceId:string}){
 await asA(tx=>tx`select app_private.claim_occurrence(${item.occurrenceId},${crypto.randomUUID()},'API')`);
 await asA(tx=>tx`select app_private.start_occurrence_with_qr(${item.occurrenceId},${ids.qr},${crypto.randomUUID()},'API')`);
}

async function taskVersion(taskId:string){
 return Number((await migrator`select version from schedule_occurrence_task where id=${taskId}`)[0].version);
}

describe("Evidence Capture & Media Pipeline Foundation database boundary",()=>{
 beforeAll(async()=>{
  const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  ids.subjectA=`evidence-a-${x}`;
  ids.subjectB=`evidence-b-${x}`;
  const rows=await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone)
    values(${`Evidence Org ${x}`},'US','USD','America/Denver') returning id),
   ua as(insert into app_user(auth_subject,email,display_name) values(${ids.subjectA},${`evidence-a-${x}@example.test`},'Evidence A') returning id),
   ub as(insert into app_user(auth_subject,email,display_name) values(${ids.subjectB},${`evidence-b-${x}@example.test`},'Evidence B') returning id),
   ma as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ua.id,'USER' from o,ua returning id),
   mb as(insert into organization_membership(organization_id,user_id,role_code) select o.id,ub.id,'USER' from o,ub returning id),
   s as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Evidence Site','EVS','America/Denver','US' from o returning id)
   select o.id org,ua.id ua,ub.id ub,ma.id ma,mb.id mb,s.id site from o,ua,ub,ma,mb,s`;
  const r=rows[0];Object.assign(ids,{org:r.org,userA:r.ua,userB:r.ub,memberA:r.ma,memberB:r.mb,site:r.site});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id)
    values(${ids.org},${ids.site},${ids.memberA}),(${ids.org},${ids.site},${ids.memberB})`;
  ids.wa=(await migrator`insert into work_area(organization_id,site_id,name,code,status)
    values(${ids.org},${ids.site},'Evidence Area','EVA','ACTIVE') returning id`)[0].id;
  ids.qr=(await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status)
    values(${ids.org},${ids.site},${ids.wa},${`evidence-qr-${x}`},'ACTIVE') returning public_token`)[0].public_token;
  ids.task=(await migrator`insert into task_master(organization_id,name,instructions_html,status)
    values(${ids.org},'Evidence Task','<p>Capture evidence.</p>','ACTIVE') returning id`)[0].id;
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

 it("creates a tenant/task-scoped PHOTO upload intent for the assigned current Task",async()=>{
  const item=await makeOccurrence("Evidence intent");
  await start(item);
  const version=await taskVersion(item.taskId);
  const rows=await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
  )`);
  expect(rows[0].result_storage_bucket).toBe("occurrence-evidence-private");
  expect(rows[0].result_object_key).toMatch(new RegExp(`^${ids.org}/${item.occurrenceId}/${item.taskId}/`));
  const e=(await migrator`select upload_status,verification_status,content_type,byte_size from schedule_occurrence_evidence where id=${rows[0].result_evidence_id}`)[0];
  expect(e).toMatchObject({upload_status:"INTENT",verification_status:"PENDING",content_type:"image/jpeg"});
  expect(Number(e.byte_size)).toBe(4096);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("rejects wrong type, non-evidence Tasks, and another membership",async()=>{
  const item=await makeOccurrence("Evidence guards");
  await start(item);
  const version=await taskVersion(item.taskId);
  await expect(asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'VIDEO','wrong.mp4','video/mp4',1024,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/does not match/i);
  await expect(asB(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','other.jpg','image/jpeg',1024,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/assigned membership/i);

  const noEvidence=await makeOccurrence("No evidence",false);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
  await start(noEvidence);
  const noEvidenceVersion=await taskVersion(noEvidence.taskId);
  await expect(asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${noEvidence.taskId},${noEvidenceVersion},'PHOTO','not-needed.jpg','image/jpeg',1024,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/does not require evidence/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${noEvidence.occurrenceId}`;
 },15000);

 it("enforces evidence MIME and size limits",async()=>{
  const item=await makeOccurrence("Evidence validation");
  await start(item);
  const version=await taskVersion(item.taskId);
  await expect(asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.gif','image/gif',1024,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/JPEG, PNG, or WebP/i);
  await expect(asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','huge.jpg','image/jpeg',20971521,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/20 MB/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("binds upload-intent idempotency to actor and full request payload",async()=>{
  const item=await makeOccurrence("Evidence idempotency");
  await start(item);
  const version=await taskVersion(item.taskId);
  const key=crypto.randomUUID();
  const first=await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${key},'API'
  )`);
  const retry=await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${key},'API'
  )`);
  expect(retry[0].result_evidence_id).toBe(first[0].result_evidence_id);
  await expect(asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','changed.jpg','image/jpeg',4096,${key},'API'
  )`)).rejects.toThrow(/another evidence upload-intent request/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("finalizes an uploaded object checksum but keeps verification PENDING",async()=>{
  const item=await makeOccurrence("Evidence finalize");
  await start(item);
  const version=await taskVersion(item.taskId);
  const intent=(await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
  )`))[0];
  const sha="a".repeat(64),key=crypto.randomUUID();
  await asA(tx=>tx`select app_private.finalize_evidence_upload(
   ${intent.result_evidence_id},${intent.result_version},${sha},${key},'API'
  )`);
  await asA(tx=>tx`select app_private.finalize_evidence_upload(
   ${intent.result_evidence_id},${intent.result_version},${sha},${key},'API'
  )`);
  const e=(await migrator`select upload_status,verification_status,sha256_hex,uploaded_at,version from schedule_occurrence_evidence where id=${intent.result_evidence_id}`)[0];
  expect(e.upload_status).toBe("UPLOADED");expect(e.verification_status).toBe("PENDING");
  expect(e.sha256_hex).toBe(sha);expect(e.uploaded_at).toBeTruthy();expect(Number(e.version)).toBe(2);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("keeps Task completion fail-closed until verification becomes VERIFIED",async()=>{
  const item=await makeOccurrence("Evidence gate");
  await start(item);
  const version=await taskVersion(item.taskId);
  const intent=(await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
  )`))[0];
  await asA(tx=>tx`select app_private.finalize_evidence_upload(
   ${intent.result_evidence_id},${intent.result_version},${"b".repeat(64)},${crypto.randomUUID()},'API'
  )`);
  await expect(asA(tx=>tx`select app_private.complete_occurrence_task(
   ${item.taskId},${version},null,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/Verified required evidence/i);
  await migrator`update schedule_occurrence_evidence
    set verification_status='VERIFIED',verified_at=now(),updated_at=now(),version=version+1
    where id=${intent.result_evidence_id}`;
  await asA(tx=>tx`select app_private.complete_occurrence_task(
   ${item.taskId},${version},null,${crypto.randomUUID()},'API'
  )`);
  expect((await migrator`select status from schedule_occurrence where id=${item.occurrenceId}`)[0].status).toBe("COMPLETED");
 });

 it("storage policy helpers bind object access to auth subject, assignment, scope, and intent",async()=>{
  const item=await makeOccurrence("Storage policy helper");
  await start(item);
  const version=await taskVersion(item.taskId);
  const intent=(await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
  )`))[0];
  const canWriteA=(await migrator`select public.storage_can_write_occurrence_evidence(
    ${intent.result_storage_bucket},${intent.result_object_key},${ids.subjectA}
  ) ok`)[0].ok;
  const canWriteB=(await migrator`select public.storage_can_write_occurrence_evidence(
    ${intent.result_storage_bucket},${intent.result_object_key},${ids.subjectB}
  ) ok`)[0].ok;
  const canReadA=(await migrator`select public.storage_can_read_occurrence_evidence(
    ${intent.result_storage_bucket},${intent.result_object_key},${ids.subjectA}
  ) ok`)[0].ok;
  const canReadB=(await migrator`select public.storage_can_read_occurrence_evidence(
    ${intent.result_storage_bucket},${intent.result_object_key},${ids.subjectB}
  ) ok`)[0].ok;
  expect(canWriteA).toBe(true);expect(canWriteB).toBe(false);
  expect(canReadA).toBe(true);expect(canReadB).toBe(false);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });


 it("fails closed for expired upload intents at Storage-policy and finalize boundaries",async()=>{
  const item=await makeOccurrence("Expired Evidence intent");
  await start(item);
  const version=await taskVersion(item.taskId);
  const intent=(await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','expired.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
  )`))[0];
  await migrator`update schedule_occurrence_evidence
    set upload_expires_at=now()-interval '1 minute'
    where id=${intent.result_evidence_id}`;
  const canWrite=(await migrator`select public.storage_can_write_occurrence_evidence(
    ${intent.result_storage_bucket},${intent.result_object_key},${ids.subjectA}
  ) ok`)[0].ok;
  expect(canWrite).toBe(false);
  await expect(asA(tx=>tx`select app_private.finalize_evidence_upload(
    ${intent.result_evidence_id},${intent.result_version},${"c".repeat(64)},${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/expired/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("rejects wrong bucket and wrong object path even for the assigned authenticated subject",async()=>{
  const item=await makeOccurrence("Wrong Evidence object");
  await start(item);
  const version=await taskVersion(item.taskId);
  const intent=(await asA(tx=>tx`select * from app_private.create_evidence_upload_intent(
   ${item.taskId},${version},'PHOTO','proof.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
  )`))[0];
  const wrongObject=(await migrator`select public.storage_can_write_occurrence_evidence(
    ${intent.result_storage_bucket},${intent.result_object_key+"-tampered"},${ids.subjectA}
  ) ok`)[0].ok;
  const wrongBucket=(await migrator`select public.storage_can_write_occurrence_evidence(
    'another-bucket',${intent.result_object_key},${ids.subjectA}
  ) ok`)[0].ok;
  expect(wrongObject).toBe(false);
  expect(wrongBucket).toBe(false);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 });

 it("keeps direct Evidence DML closed and audits intent/upload events",async()=>{
  await expect(asA(tx=>tx`update schedule_occurrence_evidence set upload_status='UPLOADED' where organization_id=${ids.org}`))
   .rejects.toThrow(/permission denied/i);
  await expect(asA(tx=>tx`delete from schedule_occurrence_evidence where organization_id=${ids.org}`))
   .rejects.toThrow(/permission denied/i);
  const actions=(await migrator`select action_code from audit_event where organization_id=${ids.org}`).map(r=>r.action_code);
  expect(actions).toContain("OCCURRENCE_EVIDENCE_INTENT_CREATED");
  expect(actions).toContain("OCCURRENCE_EVIDENCE_UPLOADED");
 });
});
