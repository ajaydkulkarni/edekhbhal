import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:4,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
type Tx=postgres.TransactionSql<{}>;

const ids={
 org:"",user:"",membership:"",site:"",wa:"",task:"",occ:"",occTask:"",
 evidence:"",authSubject:crypto.randomUUID(),workerId:`transport-${Date.now()}-${Math.random().toString(16).slice(2)}`
};

async function asCtx<T>(fn:(tx:Tx)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${ids.user},true)`;
  await tx`select set_config('app.organization_id',${ids.org},true)`;
  await tx`select set_config('app.membership_id',${ids.membership},true)`;
  return fn(tx);
 }) as Promise<T>;
}

function originalKey(){return `${ids.org}/${ids.occ}/${ids.occTask}/${ids.evidence}/original.jpg`}
function normalizedKey(){return `${ids.org}/${ids.occ}/${ids.occTask}/${ids.evidence}/normalized.webp`}
function previewKey(){return `${ids.org}/${ids.occ}/${ids.occTask}/${ids.evidence}/preview.webp`}

describe("Evidence Worker Transport & Storage Authorization Foundation 03B1",()=>{
 beforeAll(async()=>{
  const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  ids.org=(await migrator`insert into organization(name,country_code,default_currency_code,default_timezone)
    values(${`Transport Org ${x}`},'US','USD','America/Denver') returning id`)[0].id;
  ids.user=(await migrator`insert into app_user(auth_subject,email,display_name)
    values(${`transport-user-${x}`},${`transport-${x}@example.test`},'Transport User') returning id`)[0].id;
  ids.membership=(await migrator`insert into organization_membership(organization_id,user_id,role_code)
    values(${ids.org},${ids.user},'USER') returning id`)[0].id;
  ids.site=(await migrator`insert into site(organization_id,name,code,timezone,country_code)
    values(${ids.org},'Transport Site','T1','America/Denver','US') returning id`)[0].id;
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id)
    values(${ids.org},${ids.site},${ids.membership})`;
  ids.wa=(await migrator`insert into work_area(organization_id,site_id,name,code,status)
    values(${ids.org},${ids.site},'Transport Area','TA','ACTIVE') returning id`)[0].id;
  ids.task=(await migrator`insert into task_master(organization_id,name,instructions_html,status)
    values(${ids.org},'Transport Task','<p>Evidence.</p>','ACTIVE') returning id`)[0].id;
  const schedule=(await migrator`insert into schedule_master(
    organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
  ) values(${ids.org},${ids.site},${ids.wa},'Transport Schedule','ONE_TIME','2020-01-01','05:00','America/Denver','ACTIVE',false)
    returning id`)[0].id;
  ids.occ=(await migrator`insert into schedule_occurrence(
    organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,timezone_snapshot,
    local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,organization_name_snapshot,site_name_snapshot,
    work_area_name_snapshot,schedule_name_snapshot,schedule_version_snapshot,planned_duration_minutes,
    working_hours_snapshot,working_hours_source_snapshot,supersede_unstarted_snapshot,status,assigned_membership_id,claimed_at,started_at
  ) values(
    ${ids.org},${ids.site},${ids.wa},${schedule},'2020-01-01T12:00:00Z','2020-01-01T12:10:00Z','America/Denver',
    '2020-01-01','05:00',-420,'Transport Org','Transport Site','Transport Area','Transport Schedule',1,10,
    '{}'::jsonb,'ORGANIZATION',false,'IN_PROGRESS',${ids.membership},now(),now()
  ) returning id`)[0].id;
  ids.occTask=(await migrator`insert into schedule_occurrence_task(
    organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
    sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule_snapshot,
    evidence_required,required_evidence_type,status,started_at
  ) values(
    ${ids.org},${ids.site},${ids.wa},${ids.occ},${ids.task},'Transport Task','<p>Evidence.</p>',
    1,10,0,10,'PHOTO',true,'PHOTO','IN_PROGRESS',now()
  ) returning id`)[0].id;

  ids.evidence=crypto.randomUUID();
  await migrator`insert into schedule_occurrence_evidence(
    id,organization_id,site_id,work_area_id,occurrence_id,occurrence_task_id,evidence_type,object_key,
    content_type,byte_size,sha256_hex,verification_status,created_by_membership_id,storage_bucket,
    upload_status,uploaded_at,processing_status,processing_requested_at,original_disposition,version
  ) values(
    ${ids.evidence}::uuid,${ids.org},${ids.site},${ids.wa},${ids.occ},${ids.occTask},'PHOTO',${originalKey()},
    'image/jpeg',4096,${"a".repeat(64)},'PENDING',${ids.membership},'occurrence-evidence-private',
    'UPLOADED',now(),'QUEUED',now(),'PENDING',2
  )`;

  await migrator`insert into app_private.evidence_worker_storage_principal(auth_subject,worker_id,status)
    values(${ids.authSubject}::uuid,${ids.workerId},'ACTIVE')`;
 },20000);

 afterAll(async()=>{
  await migrator`delete from app_private.evidence_worker_storage_principal where auth_subject=${ids.authSubject}::uuid`;
  if(ids.org){
   await migrator`delete from audit_event where organization_id=${ids.org}`;
   await migrator`delete from outbox_event where organization_id=${ids.org}`;
   await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence_evidence where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence_task where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence where organization_id=${ids.org}`;
   await migrator`delete from schedule_master where organization_id=${ids.org}`;
   await migrator`delete from task_master where organization_id=${ids.org}`;
   await migrator`delete from work_area where organization_id=${ids.org}`;
   await migrator`delete from site_membership_scope where organization_id=${ids.org}`;
   await migrator`delete from organization_membership where organization_id=${ids.org}`;
   await migrator`delete from site where organization_id=${ids.org}`;
   await migrator`delete from organization where id=${ids.org}`;
  }
  if(ids.user)await migrator`delete from app_user where id=${ids.user}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("keeps 03B1 worker commands unavailable to normal application runtime",async()=>{
  await expect(asCtx(tx=>tx`select app_private.renew_evidence_worker_event_lease(
    ${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'runtime',90
  )`)).rejects.toThrow(/permission denied/i);
  await expect(asCtx(tx=>tx`select * from app_private.get_evidence_processing_targets(
    ${ids.evidence}::uuid,2,${crypto.randomUUID()}::uuid,'runtime'
  )`)).rejects.toThrow(/permission denied/i);
 });

 it("binds the machine Storage principal to one exact worker id",async()=>{
  expect((await migrator`select app_private.assert_evidence_worker_storage_principal(
    ${ids.authSubject}::uuid,${ids.workerId}
  ) as ok`)[0].ok).toBe(true);
  expect((await migrator`select app_private.assert_evidence_worker_storage_principal(
    ${ids.authSubject}::uuid,'other-worker'
  ) as ok`)[0].ok).toBe(false);
  await migrator`update app_private.evidence_worker_storage_principal set status='INACTIVE'
    where auth_subject=${ids.authSubject}::uuid`;
  expect((await migrator`select app_private.assert_evidence_worker_storage_principal(
    ${ids.authSubject}::uuid,${ids.workerId}
  ) as ok`)[0].ok).toBe(false);
  await migrator`update app_private.evidence_worker_storage_principal set status='ACTIVE'
    where auth_subject=${ids.authSubject}::uuid`;
 });

 it("renews only a live matching Evidence outbox claim",async()=>{
  const event=(await migrator`insert into outbox_event(
    organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key,available_at
  ) values(
    ${ids.org},'EVIDENCE_PROCESS_REQUESTED','ScheduleOccurrenceEvidence',${ids.evidence},
    ${JSON.stringify({evidenceId:ids.evidence,evidenceVersion:2})}::jsonb,${crypto.randomUUID()},'1990-01-01T00:00:00Z'
  ) returning id`)[0].id;
  const claimed=(await migrator`select * from app_private.claim_evidence_worker_event(${ids.workerId},60)`)[0];
  expect(claimed.result_event_id).toBe(event);
  const renewed=(await migrator`select app_private.renew_evidence_worker_event_lease(
    ${event}::uuid,${claimed.result_claim_token}::uuid,${ids.workerId},120
  ) as lease`)[0].lease;
  expect(new Date(renewed).getTime()).toBeGreaterThan(Date.now()+60_000);
  await expect(migrator`select app_private.renew_evidence_worker_event_lease(
    ${event}::uuid,${crypto.randomUUID()}::uuid,${ids.workerId},120
  )`).rejects.toThrow(/claim mismatch/i);
  await migrator`select app_private.fail_evidence_worker_event(
    ${event}::uuid,${claimed.result_claim_token}::uuid,${ids.workerId},'fixture cleanup',15
  )`;
  await migrator`delete from outbox_event where id=${event}`;
 },15000);

 it("issues server-owned derivative targets and binds Storage helpers to both live leases",async()=>{
  const event=(await migrator`insert into outbox_event(
    organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key,available_at
  ) values(
    ${ids.org},'EVIDENCE_PROCESS_REQUESTED','ScheduleOccurrenceEvidence',${ids.evidence},
    ${JSON.stringify({evidenceId:ids.evidence,evidenceVersion:2})}::jsonb,${crypto.randomUUID()},'1989-01-01T00:00:00Z'
  ) returning id`)[0].id;
  const queue=(await migrator`select * from app_private.claim_evidence_worker_event(${ids.workerId},120)`)[0];
  expect(queue.result_event_id).toBe(event);

  const processing=(await migrator`select * from app_private.claim_evidence_processing(
    ${ids.evidence}::uuid,2,${ids.workerId},${crypto.randomUUID()}
  )`)[0];
  expect(Number(processing.result_version)).toBe(3);

  const targets=(await migrator`select * from app_private.get_evidence_processing_targets(
    ${ids.evidence}::uuid,3,${processing.result_claim_token}::uuid,${ids.workerId}
  )`)[0];
  expect(targets.result_normalized_object_key).toBe(normalizedKey());
  expect(targets.result_preview_object_key).toBe(previewKey());
  expect(targets.result_normalized_content_type).toBe("image/webp");

  const renewed=(await migrator`select app_private.renew_evidence_processing_lease(
    ${ids.evidence}::uuid,3,${processing.result_claim_token}::uuid,${ids.workerId},300
  ) as lease`)[0].lease;
  expect(new Date(renewed).getTime()).toBeGreaterThan(Date.now()+240_000);
  await expect(migrator`select app_private.renew_evidence_processing_lease(
    ${ids.evidence}::uuid,3,${processing.result_claim_token}::uuid,'other-worker',300
  )`).rejects.toThrow(/another processor/i);

  const exactRead=(await migrator`select public.storage_worker_can_read_occurrence_evidence(
    'occurrence-evidence-private',${originalKey()},${ids.authSubject}
  ) as ok`)[0].ok;
  const exactWrite=(await migrator`select public.storage_worker_can_write_occurrence_evidence(
    'occurrence-evidence-private',${normalizedKey()},${ids.authSubject}
  ) as ok`)[0].ok;
  const previewWrite=(await migrator`select public.storage_worker_can_write_occurrence_evidence(
    'occurrence-evidence-private',${previewKey()},${ids.authSubject}
  ) as ok`)[0].ok;
  const wrongWrite=(await migrator`select public.storage_worker_can_write_occurrence_evidence(
    'occurrence-evidence-private',${`${ids.org}/${ids.evidence}/evil.webp`},${ids.authSubject}
  ) as ok`)[0].ok;
  const wrongPrincipal=(await migrator`select public.storage_worker_can_read_occurrence_evidence(
    'occurrence-evidence-private',${originalKey()},${crypto.randomUUID()}
  ) as ok`)[0].ok;
  expect(exactRead).toBe(true);
  expect(exactWrite).toBe(true);
  expect(previewWrite).toBe(true);
  expect(wrongWrite).toBe(false);
  expect(wrongPrincipal).toBe(false);

  const derivativeDelete=(await migrator`select public.storage_worker_can_delete_occurrence_evidence(
    'occurrence-evidence-private',${normalizedKey()},${ids.authSubject}
  ) as ok`)[0].ok;
  const prematureOriginalDelete=(await migrator`select public.storage_worker_can_delete_occurrence_evidence(
    'occurrence-evidence-private',${originalKey()},${ids.authSubject}
  ) as ok`)[0].ok;
  expect(derivativeDelete).toBe(true);
  expect(prematureOriginalDelete).toBe(false);

  await migrator`select app_private.complete_evidence_processing_transport(
    ${ids.evidence}::uuid,3,${processing.result_claim_token}::uuid,${ids.workerId},
    'VERIFIED','image/jpeg',4096,${"a".repeat(64)},2048,false,null,${crypto.randomUUID()}
  )`;

  const completed=(await migrator`select
    verification_status,normalized_object_key,preview_object_key,normalized_content_type,
    original_disposition,version
    from schedule_occurrence_evidence where id=${ids.evidence}::uuid`)[0];
  expect(completed.verification_status).toBe("VERIFIED");
  expect(completed.normalized_object_key).toBe(normalizedKey());
  expect(completed.preview_object_key).toBe(previewKey());
  expect(completed.normalized_content_type).toBe("image/webp");
  expect(completed.original_disposition).toBe("DELETE_QUEUED");
  expect(Number(completed.version)).toBe(4);

  await migrator`select app_private.complete_evidence_worker_event(
    ${event}::uuid,${queue.result_claim_token}::uuid,${ids.workerId}
  )`;
 },20000);

 it("authorizes original deletion only under the exact live deletion delivery",async()=>{
  const deletion=(await migrator`select id from outbox_event
    where organization_id=${ids.org}
      and event_type='EVIDENCE_ORIGINAL_DELETE_REQUESTED'
      and aggregate_id=${ids.evidence}
      and processed_at is null
    order by created_at desc limit 1`)[0];
  expect(deletion?.id).toBeTruthy();

  await migrator`update outbox_event set available_at='1980-01-01T00:00:00Z' where id=${deletion.id}`;
  const claimed=(await migrator`select * from app_private.claim_evidence_worker_event(${ids.workerId},120)`)[0];
  expect(claimed.result_event_id).toBe(deletion.id);

  expect((await migrator`select public.storage_worker_can_delete_occurrence_evidence(
    'occurrence-evidence-private',${originalKey()},${ids.authSubject}
  ) as ok`)[0].ok).toBe(true);
  expect((await migrator`select public.storage_worker_can_delete_occurrence_evidence(
    'occurrence-evidence-private',${`${originalKey()}.wrong`},${ids.authSubject}
  ) as ok`)[0].ok).toBe(false);

  await migrator`select app_private.mark_evidence_original_deleted(
    ${ids.evidence}::uuid,4,${originalKey()},${ids.workerId},${crypto.randomUUID()}
  )`;
  await migrator`select app_private.complete_evidence_worker_event(
    ${deletion.id}::uuid,${claimed.result_claim_token}::uuid,${ids.workerId}
  )`;
  const row=(await migrator`select original_disposition,version
    from schedule_occurrence_evidence where id=${ids.evidence}::uuid`)[0];
  expect(row.original_disposition).toBe("DELETED");
  expect(Number(row.version)).toBe(5);
 },15000);
});
