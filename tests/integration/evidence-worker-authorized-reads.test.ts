import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:6,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
type Tx=postgres.TransactionSql<{}>;

const ids={orgA:"",orgB:"",admin:"",adminM:"",manager:"",managerM:"",user:"",userM:"",siteA:"",siteB:"",wa:"",task:"",occ:"",occTask:"",evidence:""};

async function asCtx<T>(userId:string,orgId:string,membershipId:string,fn:(tx:Tx)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${userId},true)`;
  await tx`select set_config('app.organization_id',${orgId},true)`;
  await tx`select set_config('app.membership_id',${membershipId},true)`;
  return fn(tx);
 }) as Promise<T>;
}

describe("Evidence Worker Queue & Authorized Reads Foundation 03A",()=>{
 beforeAll(async()=>{
  const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  ids.orgA=(await migrator`insert into organization(name,country_code,default_currency_code,default_timezone) values(${`Worker Org A ${x}`},'US','USD','America/Denver') returning id`)[0].id;
  ids.orgB=(await migrator`insert into organization(name,country_code,default_currency_code,default_timezone) values(${`Worker Org B ${x}`},'US','USD','America/Denver') returning id`)[0].id;

  for(const spec of[
   ["admin","ADMIN"],["manager","SITE_MANAGER"],["user","USER"]
  ] as const){
   const u=(await migrator`insert into app_user(auth_subject,email,display_name) values(${`${spec[0]}-${x}`},${`${spec[0]}-${x}@example.test`},${spec[0]}) returning id`)[0].id;
   const m=(await migrator`insert into organization_membership(organization_id,user_id,role_code) values(${ids.orgA},${u},${spec[1]}) returning id`)[0].id;
   if(spec[0]==="admin"){ids.admin=u;ids.adminM=m}
   if(spec[0]==="manager"){ids.manager=u;ids.managerM=m}
   if(spec[0]==="user"){ids.user=u;ids.userM=m}
  }

  ids.siteA=(await migrator`insert into site(organization_id,name,code,timezone,country_code) values(${ids.orgA},'Site A','SA','America/Denver','US') returning id`)[0].id;
  ids.siteB=(await migrator`insert into site(organization_id,name,code,timezone,country_code) values(${ids.orgA},'Site B','SB','America/Denver','US') returning id`)[0].id;
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id) values
   (${ids.orgA},${ids.siteA},${ids.managerM}),(${ids.orgA},${ids.siteA},${ids.userM})`;
  ids.wa=(await migrator`insert into work_area(organization_id,site_id,name,code,status) values(${ids.orgA},${ids.siteA},'Worker Area','WA','ACTIVE') returning id`)[0].id;
  ids.task=(await migrator`insert into task_master(organization_id,name,instructions_html,status) values(${ids.orgA},'Worker Task','<p>Evidence.</p>','ACTIVE') returning id`)[0].id;
  const schedule=(await migrator`insert into schedule_master(
   organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
  ) values(${ids.orgA},${ids.siteA},${ids.wa},'Worker Schedule','ONE_TIME','2020-01-01','05:00','America/Denver','ACTIVE',false) returning id`)[0].id;
  ids.occ=(await migrator`insert into schedule_occurrence(
   organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,timezone_snapshot,
   local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,organization_name_snapshot,site_name_snapshot,
   work_area_name_snapshot,schedule_name_snapshot,schedule_version_snapshot,planned_duration_minutes,
   working_hours_snapshot,working_hours_source_snapshot,supersede_unstarted_snapshot,status,assigned_membership_id,claimed_at,started_at
  ) values(
   ${ids.orgA},${ids.siteA},${ids.wa},${schedule},'2020-01-01T12:00:00Z','2020-01-01T12:10:00Z','America/Denver',
   '2020-01-01','05:00',-420,'Worker Org','Site A','Worker Area','Worker Schedule',1,10,'{}'::jsonb,'ORGANIZATION',false,
   'IN_PROGRESS',${ids.userM},now(),now()
  ) returning id`)[0].id;
  ids.occTask=(await migrator`insert into schedule_occurrence_task(
   organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
   sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule_snapshot,
   evidence_required,required_evidence_type,status,started_at
  ) values(
   ${ids.orgA},${ids.siteA},${ids.wa},${ids.occ},${ids.task},'Worker Task','<p>Evidence.</p>',
   1,10,0,10,'PHOTO',true,'PHOTO','IN_PROGRESS',now()
  ) returning id`)[0].id;
  ids.evidence=(await migrator`insert into schedule_occurrence_evidence(
   organization_id,site_id,work_area_id,occurrence_id,occurrence_task_id,evidence_type,object_key,
   content_type,byte_size,sha256_hex,verification_status,verified_at,created_by_membership_id,storage_bucket,
   upload_status,uploaded_at,processing_status,processing_requested_at,processing_started_at,
   processing_completed_at,normalized_object_key,preview_object_key,normalized_content_type,
   normalized_byte_size,original_disposition,version
  ) values(
   ${ids.orgA},${ids.siteA},${ids.wa},${ids.occ},${ids.occTask},'PHOTO',
   ${`${ids.orgA}/${ids.occ}/${ids.occTask}/original.jpg`},'image/jpeg',4096,${"a".repeat(64)},
   'VERIFIED',now(),${ids.userM},'occurrence-evidence-private','UPLOADED',now(),'DONE',now(),now(),now(),
   ${`${ids.orgA}/${ids.evidence||"placeholder"}/normalized.webp`},
   ${`${ids.orgA}/${ids.evidence||"placeholder"}/preview.webp`},
   'image/webp',2048,'DELETE_QUEUED',3
  ) returning id`)[0].id;
  // Replace derivative paths with the actual Evidence id while preserving tenant prefix.
  await migrator`update schedule_occurrence_evidence set
    normalized_object_key=${`${ids.orgA}/${ids.evidence}/normalized.webp`},
    preview_object_key=${`${ids.orgA}/${ids.evidence}/preview.webp`}
    where id=${ids.evidence}`;
 },20000);

 afterAll(async()=>{
  if(ids.orgA){
   await migrator`delete from audit_event where organization_id=${ids.orgA}`;
   await migrator`delete from outbox_event where organization_id=${ids.orgA}`;
   await migrator`delete from operation_idempotency where organization_id=${ids.orgA}`;
   await migrator`delete from schedule_occurrence_evidence where organization_id=${ids.orgA}`;
   await migrator`delete from schedule_occurrence_task where organization_id=${ids.orgA}`;
   await migrator`delete from schedule_occurrence where organization_id=${ids.orgA}`;
   await migrator`delete from schedule_master where organization_id=${ids.orgA}`;
   await migrator`delete from task_master where organization_id=${ids.orgA}`;
   await migrator`delete from work_area where organization_id=${ids.orgA}`;
   await migrator`delete from site_membership_scope where organization_id=${ids.orgA}`;
   await migrator`delete from organization_membership where organization_id=${ids.orgA}`;
   await migrator`delete from site where organization_id=${ids.orgA}`;
   await migrator`delete from organization where id=${ids.orgA}`;
  }
  if(ids.orgB)await migrator`delete from organization where id=${ids.orgB}`;
  for(const u of[ids.admin,ids.manager,ids.user])if(u)await migrator`delete from app_user where id=${u}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("authorizes ADMIN, scoped SITE_MANAGER, and assigned USER evidence reads",async()=>{
  for(const tuple of[
   [ids.admin,ids.adminM],[ids.manager,ids.managerM],[ids.user,ids.userM]
  ] as const){
   const row=(await asCtx(tuple[0],ids.orgA,tuple[1],tx=>tx`select * from app_private.authorize_occurrence_evidence_read(${ids.evidence},'BEST')`))[0];
   expect(row.result_variant).toBe("PREVIEW");
   expect(row.result_object_key).toBe(`${ids.orgA}/${ids.evidence}/preview.webp`);
   expect(Number(row.result_expires_seconds)).toBe(60);
  }
 },15000);

 it("fails closed for wrong Site scope and cross-Organization context",async()=>{
  await migrator`delete from site_membership_scope where organization_id=${ids.orgA} and membership_id=${ids.managerM}`;
  await expect(asCtx(ids.manager,ids.orgA,ids.managerM,tx=>tx`select * from app_private.authorize_occurrence_evidence_read(${ids.evidence},'BEST')`))
   .rejects.toThrow(/Evidence not found|Site scope/i);
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id) values(${ids.orgA},${ids.siteA},${ids.managerM})`;
  await expect(asCtx(ids.admin,ids.orgB,ids.adminM,tx=>tx`select * from app_private.authorize_occurrence_evidence_read(${ids.evidence},'BEST')`))
   .rejects.toThrow(/Active tenant context|Evidence not found/i);
 },15000);

 it("normal runtime cannot execute worker queue or deletion commands",async()=>{
  await expect(asCtx(ids.user,ids.orgA,ids.userM,tx=>tx`select * from app_private.claim_evidence_worker_event('runtime',60)`))
   .rejects.toThrow(/permission denied/i);
  await expect(asCtx(ids.user,ids.orgA,ids.userM,tx=>tx`select app_private.mark_evidence_original_deleted(
   ${ids.evidence},3,${`${ids.orgA}/${ids.occ}/${ids.occTask}/original.jpg`},'runtime',${crypto.randomUUID()}
  )`)).rejects.toThrow(/permission denied/i);
 });

 it("claims one outbox event with a lease and safely retries failures",async()=>{
  // The worker queue is intentionally global across Organizations. Give this
  // fixture an earlier available_at so concurrent integration suites cannot
  // legitimately win the same global queue claim.
  const event=(await migrator`insert into outbox_event(
   organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key,available_at
  ) values(
   ${ids.orgA},'EVIDENCE_PROCESS_REQUESTED','ScheduleOccurrenceEvidence',${ids.evidence},
   '{}'::jsonb,${crypto.randomUUID()},'2000-01-01T00:00:00Z'
  ) returning id`)[0].id;
  const claimed=(await migrator`select * from app_private.claim_evidence_worker_event('worker-a',60)`)[0];
  expect(claimed.result_event_id).toBe(event);
  expect(claimed.result_claim_token).toBeTruthy();
  await migrator`select app_private.fail_evidence_worker_event(
   ${event},${claimed.result_claim_token},'worker-a','temporary storage failure',15
  )`;
  const row=(await migrator`select processed_at,worker_claim_token,last_error,attempt_count from outbox_event where id=${event}`)[0];
  expect(row.processed_at).toBeNull();
  expect(row.worker_claim_token).toBeNull();
  expect(row.last_error).toBe("temporary storage failure");
  expect(Number(row.attempt_count)).toBe(1);
  await migrator`delete from outbox_event where id=${event}`;
 },15000);

 it("rejects stale/mismatched worker claim tokens",async()=>{
  // Keep this global-queue fixture deterministic while other integration
  // suites are concurrently producing real Evidence outbox events.
  const event=(await migrator`insert into outbox_event(
   organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key,available_at
  ) values(
   ${ids.orgA},'EVIDENCE_ORIGINAL_DELETE_REQUESTED','ScheduleOccurrenceEvidence',${ids.evidence},
   '{}'::jsonb,${crypto.randomUUID()},'2000-01-01T00:00:00Z'
  ) returning id`)[0].id;
  const claimed=(await migrator`select * from app_private.claim_evidence_worker_event('worker-a',60)`)[0];
  await expect(migrator`select app_private.complete_evidence_worker_event(${event},${crypto.randomUUID()},'worker-a')`)
   .rejects.toThrow(/claim mismatch/i);
  await migrator`select app_private.complete_evidence_worker_event(${event},${claimed.result_claim_token},'worker-a')`;
  const row=(await migrator`select processed_at from outbox_event where id=${event}`)[0];
  expect(row.processed_at).toBeTruthy();
  await migrator`delete from outbox_event where id=${event}`;
 },15000);

 it("marks an exact queued original as DELETED idempotently and audits it",async()=>{
  const before=Number((await migrator`select version from schedule_occurrence_evidence where id=${ids.evidence}`)[0].version);
  const key=`${ids.orgA}/${ids.occ}/${ids.occTask}/original.jpg`;
  const idem=crypto.randomUUID();
  await migrator`select app_private.mark_evidence_original_deleted(${ids.evidence},${before},${key},'worker-a',${idem})`;
  await migrator`select app_private.mark_evidence_original_deleted(${ids.evidence},${before},${key},'worker-a',${idem})`;
  const e=(await migrator`select original_disposition from schedule_occurrence_evidence where id=${ids.evidence}`)[0];
  expect(e.original_disposition).toBe("DELETED");
  const audit=await migrator`select action_code from audit_event where organization_id=${ids.orgA} and entity_id=${ids.evidence} and action_code='OCCURRENCE_EVIDENCE_ORIGINAL_DELETED'`;
  expect(audit).toHaveLength(1);
  await expect(asCtx(ids.user,ids.orgA,ids.userM,tx=>tx`select * from app_private.authorize_occurrence_evidence_read(${ids.evidence},'ORIGINAL')`))
   .rejects.toThrow(/deleted/i);
 },15000);
});
