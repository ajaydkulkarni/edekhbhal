import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:6,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
type Tx=postgres.TransactionSql<{}>;
const ids={org:"",user:"",member:"",site:"",wa:"",qr:"",task:""};

async function asUser<T>(fn:(tx:Tx)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${ids.user},true)`;
  await tx`select set_config('app.organization_id',${ids.org},true)`;
  await tx`select set_config('app.membership_id',${ids.member},true)`;
  return fn(tx);
 }) as Promise<T>;
}

async function makeUploadedEvidence(name:string){
 const s=(await migrator`insert into schedule_master(
  organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
 ) values(${ids.org},${ids.site},${ids.wa},${name},'ONE_TIME','2020-01-01','05:00','America/Denver','ACTIVE',false) returning id`)[0].id;
 await migrator`insert into schedule_task(
  organization_id,site_id,work_area_id,schedule_id,task_id,sequence,planned_duration_minutes,
  planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule
 ) values(${ids.org},${ids.site},${ids.wa},${s},${ids.task},1,10,0,10,'PHOTO')`;
 const o=(await migrator`insert into schedule_occurrence(
  organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,
  timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,
  organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,
  schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot,
  supersede_unstarted_snapshot,status
 ) values(
  ${ids.org},${ids.site},${ids.wa},${s},'2020-01-01T12:00:00Z','2020-01-01T12:10:00Z',
  'America/Denver','2020-01-01','05:00',-420,'Processing Org','Processing Site','Processing Area',${name},
  1,10,'{}'::jsonb,'ORGANIZATION',false,'PENDING'
 ) returning id`)[0].id;
 const t=(await migrator`insert into schedule_occurrence_task(
  organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
  sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,
  evidence_rule_snapshot,evidence_required,required_evidence_type,status
 ) values(
  ${ids.org},${ids.site},${ids.wa},${o},${ids.task},'Process evidence','<p>Capture.</p>',
  1,10,0,10,'PHOTO',true,'PHOTO','PENDING'
 ) returning id`)[0].id;
 await asUser(tx=>tx`select app_private.claim_occurrence(${o},${crypto.randomUUID()},'API')`);
 await asUser(tx=>tx`select app_private.start_occurrence_with_qr(${o},${ids.qr},${crypto.randomUUID()},'API')`);
 const taskVersion=Number((await migrator`select version from schedule_occurrence_task where id=${t}`)[0].version);
 const intent=(await asUser(tx=>tx`select * from app_private.create_evidence_upload_intent(
  ${t},${taskVersion},'PHOTO','proof.jpg','image/jpeg',4096,${crypto.randomUUID()},'API'
 )`))[0];
 const sha="d".repeat(64);
 await asUser(tx=>tx`select app_private.finalize_evidence_upload(
  ${intent.result_evidence_id},${intent.result_version},${sha},${crypto.randomUUID()},'API'
 )`);
 const e=(await migrator`select * from schedule_occurrence_evidence where id=${intent.result_evidence_id}`)[0];
 return{occurrenceId:o,taskId:t,evidenceId:intent.result_evidence_id as string,sha,version:Number(e.version),objectKey:e.object_key as string};
}

describe("Evidence Verification & Media Normalization Foundation 02",()=>{
 beforeAll(async()=>{
  const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const row=(await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone)
      values(${`Processing Org ${x}`},'US','USD','America/Denver') returning id),
   u as(insert into app_user(auth_subject,email,display_name)
      values(${`processing-${x}`},${`processing-${x}@example.test`},'Processing User') returning id),
   m as(insert into organization_membership(organization_id,user_id,role_code)
      select o.id,u.id,'USER' from o,u returning id),
   s as(insert into site(organization_id,name,code,timezone,country_code)
      select o.id,'Processing Site','PRS','America/Denver','US' from o returning id)
   select o.id org,u.id usr,m.id mem,s.id site from o,u,m,s`)[0];
  Object.assign(ids,{org:row.org,user:row.usr,member:row.mem,site:row.site});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id)
    values(${ids.org},${ids.site},${ids.member})`;
  ids.wa=(await migrator`insert into work_area(organization_id,site_id,name,code,status)
    values(${ids.org},${ids.site},'Processing Area','PRA','ACTIVE') returning id`)[0].id;
  ids.qr=(await migrator`insert into work_area_qr(organization_id,site_id,work_area_id,public_token,status)
    values(${ids.org},${ids.site},${ids.wa},${`processing-qr-${x}`},'ACTIVE') returning public_token`)[0].public_token;
  ids.task=(await migrator`insert into task_master(organization_id,name,instructions_html,status)
    values(${ids.org},'Processing Task','<p>Process evidence.</p>','ACTIVE') returning id`)[0].id;
 },20000);

 afterAll(async()=>{
  if(ids.org){
   await migrator`delete from audit_event where organization_id=${ids.org}`;
   await migrator`delete from outbox_event where organization_id=${ids.org}`;
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
  if(ids.user)await migrator`delete from app_user where id=${ids.user}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("queues processing transactionally when upload finalization succeeds",async()=>{
  const item=await makeUploadedEvidence("Queue processing");
  const e=(await migrator`select processing_status,processing_requested_at,verification_status from schedule_occurrence_evidence where id=${item.evidenceId}`)[0];
  expect(e.processing_status).toBe("QUEUED");
  expect(e.processing_requested_at).toBeTruthy();
  expect(e.verification_status).toBe("PENDING");
  const events=await migrator`select event_type,payload_json from outbox_event where organization_id=${ids.org} and aggregate_id=${item.evidenceId}`;
  expect(events).toHaveLength(1);
  expect(events[0].event_type).toBe("EVIDENCE_PROCESS_REQUESTED");
  expect(events[0].payload_json.sha256Hex).toBe(item.sha);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 },15000);

 it("keeps processor commands unavailable to normal runtime",async()=>{
  const item=await makeUploadedEvidence("Runtime cannot process");
  await expect(asUser(tx=>tx`select * from app_private.claim_evidence_processing(
    ${item.evidenceId},${item.version},'web-runtime',${crypto.randomUUID()}
  )`)).rejects.toThrow(/permission denied/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 },15000);

 it("claims queued work with a lease/token and supports idempotent replay",async()=>{
  const item=await makeUploadedEvidence("Claim processing");
  const key=crypto.randomUUID();
  const first=(await migrator`select * from app_private.claim_evidence_processing(
    ${item.evidenceId},${item.version},'processor-a',${key}
  )`)[0];
  const retry=(await migrator`select * from app_private.claim_evidence_processing(
    ${item.evidenceId},${item.version},'processor-a',${key}
  )`)[0];
  expect(retry.result_claim_token).toBe(first.result_claim_token);
  expect(retry.result_version).toBe(first.result_version);
  const e=(await migrator`select processing_status,processor_id,processing_attempt_count from schedule_occurrence_evidence where id=${item.evidenceId}`)[0];
  expect(e.processing_status).toBe("PROCESSING");
  expect(e.processor_id).toBe("processor-a");
  expect(Number(e.processing_attempt_count)).toBe(1);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 },15000);

 it("fails closed when processor-observed source metadata differs from upload metadata",async()=>{
  const item=await makeUploadedEvidence("Metadata mismatch");
  const claim=(await migrator`select * from app_private.claim_evidence_processing(
    ${item.evidenceId},${item.version},'processor-a',${crypto.randomUUID()}
  )`)[0];
  await expect(migrator`select app_private.complete_evidence_processing(
    ${item.evidenceId},${claim.result_version},${claim.result_claim_token},'processor-a','VERIFIED',
    'image/jpeg',4096,${"e".repeat(64)},
    ${`${ids.org}/${item.evidenceId}/normalized.webp`},'image/webp',2048,
    ${`${ids.org}/${item.evidenceId}/preview.webp`},false,null,${crypto.randomUUID()}
  )`).rejects.toThrow(/checksum does not match/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 },15000);

 it("VERIFIED processing records derivatives, audits the decision, and queues original deletion",async()=>{
  const item=await makeUploadedEvidence("Verify processing");
  const claim=(await migrator`select * from app_private.claim_evidence_processing(
    ${item.evidenceId},${item.version},'processor-a',${crypto.randomUUID()}
  )`)[0];
  const normalized=`${ids.org}/${item.evidenceId}/normalized.webp`;
  const preview=`${ids.org}/${item.evidenceId}/preview.webp`;
  await migrator`select app_private.complete_evidence_processing(
    ${item.evidenceId},${claim.result_version},${claim.result_claim_token},'processor-a','VERIFIED',
    'image/jpeg',4096,${item.sha},
    ${normalized},'image/webp',2048,${preview},false,null,${crypto.randomUUID()}
  )`;
  const e=(await migrator`select verification_status,processing_status,normalized_object_key,preview_object_key,original_disposition from schedule_occurrence_evidence where id=${item.evidenceId}`)[0];
  expect(e).toMatchObject({
    verification_status:"VERIFIED",processing_status:"DONE",
    normalized_object_key:normalized,preview_object_key:preview,
    original_disposition:"DELETE_QUEUED"
  });
  const deletion=await migrator`select event_type from outbox_event where organization_id=${ids.org} and aggregate_id=${item.evidenceId} and event_type='EVIDENCE_ORIGINAL_DELETE_REQUESTED'`;
  expect(deletion).toHaveLength(1);
  const audit=await migrator`select action_code,actor_display_name_snapshot,source_channel from audit_event where organization_id=${ids.org} and entity_id=${item.evidenceId} and action_code='OCCURRENCE_EVIDENCE_VERIFIED'`;
  expect(audit[0]).toMatchObject({action_code:"OCCURRENCE_EVIDENCE_VERIFIED",actor_display_name_snapshot:"processor-a",source_channel:"WORKER"});
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 },15000);

 it("REJECTED processing preserves the original and never satisfies the Task evidence gate",async()=>{
  const item=await makeUploadedEvidence("Reject processing");
  const claim=(await migrator`select * from app_private.claim_evidence_processing(
    ${item.evidenceId},${item.version},'processor-b',${crypto.randomUUID()}
  )`)[0];
  await migrator`select app_private.complete_evidence_processing(
    ${item.evidenceId},${claim.result_version},${claim.result_claim_token},'processor-b','REJECTED',
    'image/jpeg',4096,${item.sha},
    null,null,null,null,true,'Unsupported image structure',${crypto.randomUUID()}
  )`;
  const e=(await migrator`select verification_status,processing_status,verification_reason,original_disposition from schedule_occurrence_evidence where id=${item.evidenceId}`)[0];
  expect(e).toMatchObject({
    verification_status:"REJECTED",processing_status:"FAILED",
    verification_reason:"Unsupported image structure",original_disposition:"RETAIN"
  });
  const taskVersion=Number((await migrator`select version from schedule_occurrence_task where id=${item.taskId}`)[0].version);
  await expect(asUser(tx=>tx`select app_private.complete_occurrence_task(
    ${item.taskId},${taskVersion},null,${crypto.randomUUID()},'API'
  )`)).rejects.toThrow(/Verified required evidence/i);
  await migrator`update schedule_occurrence set status='COMPLETED',completed_at=now() where id=${item.occurrenceId}`;
 },15000);
});
