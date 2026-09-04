import postgres from "postgres";
import {afterAll,beforeAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:2,prepare:false,ssl:"require"});
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
type Tx=postgres.TransactionSql<{}>;

const ids={
  org:"",user:"",membership:"",site:"",wa:"",task:"",occ:"",occTask:"",
  evidence:"",workerId:`media-${Date.now()}-${Math.random().toString(16).slice(2)}`
};

async function asCtx<T>(fn:(tx:Tx)=>Promise<T>){
  return runtime.begin(async tx=>{
    await tx`select set_config('app.user_id',${ids.user},true)`;
    await tx`select set_config('app.organization_id',${ids.org},true)`;
    await tx`select set_config('app.membership_id',${ids.membership},true)`;
    return fn(tx);
  }) as Promise<T>;
}

function originalKey(){
  return `${ids.org}/${ids.occ}/${ids.occTask}/${ids.evidence}/original.jpg`;
}

async function createClaimedEvent(claimToken:string){
  const payload={
    evidenceId:ids.evidence,
    organizationId:ids.org,
    siteId:ids.site,
    workAreaId:ids.wa,
    occurrenceId:ids.occ,
    occurrenceTaskId:ids.occTask,
    storageBucket:"occurrence-evidence-private",
    objectKey:originalKey(),
    evidenceType:"PHOTO",
    contentType:"image/jpeg",
    byteSize:4096,
    sha256Hex:"a".repeat(64),
    evidenceVersion:2
  };
  return (await migrator`insert into outbox_event(
    organization_id,event_type,aggregate_type,aggregate_id,payload_json,idempotency_key,
    available_at,worker_claim_token,worker_id,worker_lease_until,last_attempt_at,attempt_count
  ) values(
    ${ids.org},'EVIDENCE_PROCESS_REQUESTED','ScheduleOccurrenceEvidence',${ids.evidence},
    ${migrator.json(payload)}::jsonb,${crypto.randomUUID()},now(),
    ${claimToken}::uuid,${ids.workerId},now()+interval '5 minutes',now(),1
  ) returning id`)[0].id as string;
}

describe("Evidence Worker Real Media Processing Foundation 03B2 database hardening",()=>{
  beforeAll(async()=>{
    const x=`${Date.now()}-${Math.random().toString(16).slice(2)}`;
    ids.org=(await migrator`insert into organization(name,country_code,default_currency_code,default_timezone)
      values(${`Media Org ${x}`},'US','USD','America/Denver') returning id`)[0].id;
    ids.user=(await migrator`insert into app_user(auth_subject,email,display_name)
      values(${`media-user-${x}`},${`media-${x}@example.test`},'Media User') returning id`)[0].id;
    ids.membership=(await migrator`insert into organization_membership(organization_id,user_id,role_code)
      values(${ids.org},${ids.user},'USER') returning id`)[0].id;
    ids.site=(await migrator`insert into site(organization_id,name,code,timezone,country_code)
      values(${ids.org},'Media Site','M1','America/Denver','US') returning id`)[0].id;
    await migrator`insert into site_membership_scope(organization_id,site_id,membership_id)
      values(${ids.org},${ids.site},${ids.membership})`;
    ids.wa=(await migrator`insert into work_area(organization_id,site_id,name,code,status)
      values(${ids.org},${ids.site},'Media Area','MA','ACTIVE') returning id`)[0].id;
    ids.task=(await migrator`insert into task_master(organization_id,name,instructions_html,status)
      values(${ids.org},'Media Task','<p>Evidence.</p>','ACTIVE') returning id`)[0].id;
    const schedule=(await migrator`insert into schedule_master(
      organization_id,site_id,work_area_id,name,frequency_type,start_local_date,start_local_time,timezone,status,supersede_unstarted
    ) values(${ids.org},${ids.site},${ids.wa},'Media Schedule','ONE_TIME','2020-01-01','05:00','America/Denver','ACTIVE',false)
      returning id`)[0].id;
    ids.occ=(await migrator`insert into schedule_occurrence(
      organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,timezone_snapshot,
      local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,organization_name_snapshot,site_name_snapshot,
      work_area_name_snapshot,schedule_name_snapshot,schedule_version_snapshot,planned_duration_minutes,
      working_hours_snapshot,working_hours_source_snapshot,supersede_unstarted_snapshot,status,assigned_membership_id,claimed_at,started_at
    ) values(
      ${ids.org},${ids.site},${ids.wa},${schedule},'2020-01-01T12:00:00Z','2020-01-01T12:10:00Z','America/Denver',
      '2020-01-01','05:00',-420,'Media Org','Media Site','Media Area','Media Schedule',1,10,
      '{}'::jsonb,'ORGANIZATION',false,'IN_PROGRESS',${ids.membership},now(),now()
    ) returning id`)[0].id;
    ids.occTask=(await migrator`insert into schedule_occurrence_task(
      organization_id,site_id,work_area_id,occurrence_id,task_id,task_name_snapshot,task_instructions_snapshot,
      sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule_snapshot,
      evidence_required,required_evidence_type,status,started_at
    ) values(
      ${ids.org},${ids.site},${ids.wa},${ids.occ},${ids.task},'Media Task','<p>Evidence.</p>',
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
  },20000);

  afterAll(async()=>{
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
    await runtime.end({timeout:5});
    await migrator.end({timeout:5});
  });

  it("keeps all 03B2 media hardening commands unavailable to normal runtime",async()=>{
    await expect(asCtx(tx=>tx`select * from app_private.claim_evidence_processing_for_event(
      ${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'runtime','x'
    )`)).rejects.toThrow(/permission denied/i);
    await expect(asCtx(tx=>tx`select app_private.complete_evidence_worker_event_if_terminal(
      ${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'runtime'
    )`)).rejects.toThrow(/permission denied/i);
  });

  it("removes free-form queue completion and stale-version processing claim from the worker role",async()=>{
    const p=(await migrator`select
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_processing_for_event(uuid,uuid,text,text)','EXECUTE') claim_event,
      has_function_privilege('vnext_evidence_worker','app_private.complete_evidence_worker_event_if_terminal(uuid,uuid,text)','EXECUTE') terminal_complete,
      has_function_privilege('vnext_evidence_worker','app_private.mark_evidence_original_deleted_for_event(uuid,uuid,text,text)','EXECUTE') delete_for_event,
      has_function_privilege('vnext_evidence_worker','app_private.claim_evidence_processing(uuid,bigint,text,text)','EXECUTE') legacy_claim,
      has_function_privilege('vnext_evidence_worker','app_private.complete_evidence_worker_event(uuid,uuid,text)','EXECUTE') free_complete,
      has_function_privilege('vnext_evidence_worker','app_private.mark_evidence_original_deleted(uuid,bigint,text,text,text)','EXECUTE') free_delete
    `)[0];
    expect(p.claim_event).toBe(true);
    expect(p.terminal_complete).toBe(true);
    expect(p.delete_for_event).toBe(true);
    expect(p.legacy_claim).toBe(false);
    expect(p.free_complete).toBe(false);
    expect(p.free_delete).toBe(false);
  });

  it("reclaims an expired processing attempt from the current Evidence version even when the event payload version is stale",async()=>{
    const eventToken1=crypto.randomUUID();
    const eventId=await createClaimedEvent(eventToken1);

    const first=(await migrator`select * from app_private.claim_evidence_processing_for_event(
      ${eventId}::uuid,${eventToken1}::uuid,${ids.workerId},${`claim:${eventToken1}`}
    )`)[0];
    expect(Number(first.result_version)).toBe(3);

    const replay=(await migrator`select * from app_private.claim_evidence_processing_for_event(
      ${eventId}::uuid,${eventToken1}::uuid,${ids.workerId},${`claim:${eventToken1}`}
    )`)[0];
    expect(replay.result_claim_token).toBe(first.result_claim_token);
    expect(Number(replay.result_version)).toBe(3);

    expect((await migrator`select app_private.complete_evidence_worker_event_if_terminal(
      ${eventId}::uuid,${eventToken1}::uuid,${ids.workerId}
    ) as done`)[0].done).toBe(false);

    await expect(migrator`select app_private.release_evidence_processing_lease_for_retry(
      ${ids.evidence}::uuid,3,${crypto.randomUUID()}::uuid,${ids.workerId},'wrong token'
    )`).rejects.toThrow(/token mismatch/i);

    await migrator`select app_private.release_evidence_processing_lease_for_retry(
      ${ids.evidence}::uuid,3,${first.result_claim_token}::uuid,${ids.workerId},'simulate crash retry'
    )`;

    await expect(migrator`select app_private.renew_evidence_processing_lease(
      ${ids.evidence}::uuid,3,${first.result_claim_token}::uuid,${ids.workerId},300
    )`).rejects.toThrow(/expired/i);

    const eventToken2=crypto.randomUUID();
    await migrator`update outbox_event
      set worker_claim_token=${eventToken2}::uuid,
          worker_id=${ids.workerId},
          worker_lease_until=now()+interval '5 minutes',
          last_attempt_at=now(),
          attempt_count=attempt_count+1
      where id=${eventId}::uuid`;

    const second=(await migrator`select * from app_private.claim_evidence_processing_for_event(
      ${eventId}::uuid,${eventToken2}::uuid,${ids.workerId},${`claim:${eventToken2}`}
    )`)[0];

    // The original outbox payload still says evidenceVersion=2. 03B2 correctly
    // claims from the current Evidence version=3 and advances it to 4.
    expect(Number(second.result_version)).toBe(4);

    await migrator`select app_private.reject_evidence_processing_observation(
      ${ids.evidence}::uuid,4,${second.result_claim_token}::uuid,${ids.workerId},
      'image/png',12,${"b".repeat(64)},'SOURCE_METADATA_MISMATCH',${`reject:${eventToken2}`}
    )`;

    const rejected=(await migrator`select
      verification_status,processing_status,original_disposition,version,verification_reason
      from schedule_occurrence_evidence where id=${ids.evidence}::uuid`)[0];
    expect(rejected.verification_status).toBe("REJECTED");
    expect(rejected.processing_status).toBe("FAILED");
    expect(rejected.original_disposition).toBe("RETAIN");
    expect(Number(rejected.version)).toBe(5);
    expect(rejected.verification_reason).toBe("SOURCE_METADATA_MISMATCH");

    // Idempotent replay of the same terminal rejection is safe.
    await migrator`select app_private.reject_evidence_processing_observation(
      ${ids.evidence}::uuid,4,${second.result_claim_token}::uuid,${ids.workerId},
      'image/png',12,${"b".repeat(64)},'SOURCE_METADATA_MISMATCH',${`reject:${eventToken2}`}
    )`;

    expect((await migrator`select app_private.complete_evidence_worker_event_if_terminal(
      ${eventId}::uuid,${eventToken2}::uuid,${ids.workerId}
    ) as done`)[0].done).toBe(true);

    const finalEvent=(await migrator`select processed_at,worker_claim_token,worker_id
      from outbox_event where id=${eventId}::uuid`)[0];
    expect(finalEvent.processed_at).toBeTruthy();
    expect(finalEvent.worker_claim_token).toBeNull();
    expect(finalEvent.worker_id).toBeNull();

    const deletes=await migrator`select id from outbox_event
      where organization_id=${ids.org}
        and event_type='EVIDENCE_ORIGINAL_DELETE_REQUESTED'
        and aggregate_id=${ids.evidence}`;
    expect(deletes).toHaveLength(0);
  },20000);

  it("records the independent observation in worker audit without direct worker table grants",async()=>{
    const audit=(await migrator`select new_value_json,reason,source_channel
      from audit_event
      where organization_id=${ids.org}
        and entity_id=${ids.evidence}
        and action_code='OCCURRENCE_EVIDENCE_REJECTED'
      order by timestamp_utc desc limit 1`)[0];
    expect(audit.source_channel).toBe("WORKER");
    expect(audit.reason).toBe("SOURCE_METADATA_MISMATCH");
    expect(audit.new_value_json.observedContentType).toBe("image/png");
    expect(Number(audit.new_value_json.observedByteSize)).toBe(12);
    expect(audit.new_value_json.observedSha256Hex).toBe("b".repeat(64));

    const direct=await migrator`select table_schema,table_name,privilege_type
      from information_schema.role_table_grants
      where grantee='vnext_evidence_worker'
        and (
          (table_schema='public' and table_name in('outbox_event','schedule_occurrence_evidence','audit_event','operation_idempotency'))
          or table_schema='app_private'
        )`;
    expect(direct).toHaveLength(0);
  });
});
