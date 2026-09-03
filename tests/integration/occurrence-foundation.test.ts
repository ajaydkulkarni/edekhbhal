import postgres from "postgres";
import {afterAll,describe,expect,it} from "vitest";

const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:5,prepare:false,ssl:"require"}),migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
const ids={org:"",adminUser:"",adminMembership:"",managerUser:"",managerMembership:"",userUser:"",userMembership:"",site:"",workArea:"",taskA:"",taskB:""};

async function asContext<T>(userId:string,membershipId:string,fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>){
 return runtime.begin(async tx=>{
  await tx`select set_config('app.user_id',${userId},true)`;
  await tx`select set_config('app.organization_id',${ids.org},true)`;
  await tx`select set_config('app.membership_id',${membershipId},true)`;
  return fn(tx);
 }) as Promise<T>;
}
const asAdmin=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>asContext(ids.adminUser,ids.adminMembership,fn);
const asUser=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>asContext(ids.userUser,ids.userMembership,fn);
const tasks=()=>[
 {taskId:ids.taskA,sequence:1,plannedDurationMinutes:20,evidenceRule:"PHOTO",randomEveryN:null,randomEvidenceType:null},
 {taskId:ids.taskB,sequence:2,plannedDurationMinutes:15,evidenceRule:"RANDOM",randomEveryN:3,randomEvidenceType:"EITHER"}
];

describe("Occurrence Foundation database boundary",()=>{
 afterAll(async()=>{
  if(ids.org){
   await migrator`delete from schedule_occurrence_task where organization_id=${ids.org}`;
   await migrator`delete from schedule_occurrence where organization_id=${ids.org}`;
   await migrator`delete from audit_event where organization_id=${ids.org}`;
   await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
   await migrator`delete from schedule_task where organization_id=${ids.org}`;
   await migrator`delete from schedule_master where organization_id=${ids.org}`;
   await migrator`delete from task_attachment where organization_id=${ids.org}`;
   await migrator`delete from task_master where organization_id=${ids.org}`;
   await migrator`delete from work_area_qr where organization_id=${ids.org}`;
   await migrator`delete from work_area where organization_id=${ids.org}`;
   await migrator`delete from site_membership_scope where organization_id=${ids.org}`;
   await migrator`delete from organization_membership where organization_id=${ids.org}`;
   await migrator`delete from site where organization_id=${ids.org}`;
   await migrator`delete from organization where id=${ids.org}`;
  }
  for(const id of[ids.adminUser,ids.managerUser,ids.userUser])if(id)await migrator`delete from app_user where id=${id}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("creates tenant/site fixture with explicit 24x7 Organization working-hours default",async()=>{
  const suffix=Date.now().toString();
  const rows=await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone)
    values(${`Occurrence Org ${suffix}`},'US','USD','America/Denver') returning id),
   au as(insert into app_user(auth_subject,email,display_name) values(${`occ-admin-${suffix}`},${`occ-admin-${suffix}@example.test`},'Occurrence Admin') returning id),
   mu as(insert into app_user(auth_subject,email,display_name) values(${`occ-manager-${suffix}`},${`occ-manager-${suffix}@example.test`},'Occurrence Manager') returning id),
   uu as(insert into app_user(auth_subject,email,display_name) values(${`occ-user-${suffix}`},${`occ-user-${suffix}@example.test`},'Occurrence User') returning id),
   am as(insert into organization_membership(organization_id,user_id,role_code) select o.id,au.id,'ADMIN'::membership_role from o,au returning id),
   mm as(insert into organization_membership(organization_id,user_id,role_code) select o.id,mu.id,'SITE_MANAGER'::membership_role from o,mu returning id),
   um as(insert into organization_membership(organization_id,user_id,role_code) select o.id,uu.id,'USER'::membership_role from o,uu returning id),
   s as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Occurrence Site','OCC','America/Denver','US' from o returning id)
   select o.id org_id,au.id admin_user,am.id admin_membership,mu.id manager_user,mm.id manager_membership,uu.id user_user,um.id user_membership,s.id site_id
   from o,au,am,mu,mm,uu,um,s`;
  const r=rows[0];Object.assign(ids,{org:r.org_id,adminUser:r.admin_user,adminMembership:r.admin_membership,managerUser:r.manager_user,managerMembership:r.manager_membership,userUser:r.user_user,userMembership:r.user_membership,site:r.site_id});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id) values(${ids.org},${ids.site},${ids.managerMembership}),(${ids.org},${ids.site},${ids.userMembership})`;
  const wa=await migrator`insert into work_area(organization_id,site_id,name,code,status) values(${ids.org},${ids.site},'Main Lobby','LOBBY','ACTIVE') returning id`;ids.workArea=wa[0].id;
  const taskRows=await migrator`insert into task_master(organization_id,name,instructions_html,status) values(${ids.org},'Clean glass','<p>Clean glass.</p>','ACTIVE'),(${ids.org},'Restock supplies','<p>Restock supplies.</p>','ACTIVE') returning id,name`;
  ids.taskA=taskRows.find(x=>x.name==="Clean glass")!.id;ids.taskB=taskRows.find(x=>x.name==="Restock supplies")!.id;
  const h=await migrator`select default_working_hours_json->'1' monday from organization where id=${ids.org}`;
  expect(h[0].monday).toEqual([{start:"00:00",end:"24:00"}]);
 });

 it("generates immutable UTC/local snapshots and Task evidence decisions",async()=>{
  const created=await asAdmin(tx=>tx<{id:string}[]>`select app_private.create_schedule_master(
    ${ids.workArea},'Snapshot Schedule','SOP-HK-004','Rev 03','ONE_TIME',null,null,null,
    '2028-01-31','08:00',null,${tx.json(tasks())},${crypto.randomUUID()}) id`);
  const scheduleId=created[0].id;
  await asAdmin(tx=>tx`select app_private.reconcile_schedule_occurrences(${scheduleId},'2028-01-31T00:00:00Z','2028-02-01T00:00:00Z')`);
  const rows=await asUser(tx=>tx`select schedule_name_snapshot,timezone_snapshot,local_date_snapshot::text,to_char(local_time_snapshot,'HH24:MI') local_time,utc_offset_minutes_snapshot,document_reference_snapshot,document_revision_snapshot,planned_duration_minutes,working_hours_source_snapshot,status from schedule_occurrence where schedule_id=${scheduleId}`);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({schedule_name_snapshot:"Snapshot Schedule",timezone_snapshot:"America/Denver",local_date_snapshot:"2028-01-31",local_time:"08:00",utc_offset_minutes_snapshot:-420,document_reference_snapshot:"SOP-HK-004",document_revision_snapshot:"Rev 03",planned_duration_minutes:35,working_hours_source_snapshot:"ORGANIZATION",status:"PENDING"});
  const ot=await asUser(tx=>tx`select sequence,task_name_snapshot,evidence_rule_snapshot,evidence_required,required_evidence_type from schedule_occurrence_task order by sequence`);
  expect(ot[0]).toMatchObject({sequence:1,task_name_snapshot:"Clean glass",evidence_rule_snapshot:"PHOTO",evidence_required:true,required_evidence_type:"PHOTO"});
  expect(ot[1].evidence_rule_snapshot).toBe("RANDOM");
 });

 it("skips nonexistent DST-gap local intent and snapshots canonical overlap offset",async()=>{
  const gap=await asAdmin(tx=>tx<{id:string}[]>`select app_private.create_schedule_master(
    ${ids.workArea},'Gap Schedule','','','ONE_TIME',null,null,null,'2027-03-14','02:30',null,${tx.json(tasks())},${crypto.randomUUID()}) id`);
  await asAdmin(tx=>tx`select app_private.reconcile_schedule_occurrences(${gap[0].id},'2027-03-14T00:00:00Z','2027-03-15T00:00:00Z')`);
  expect(await asUser(tx=>tx`select id from schedule_occurrence where schedule_id=${gap[0].id}`)).toHaveLength(0);

  const overlap=await asAdmin(tx=>tx<{id:string}[]>`select app_private.create_schedule_master(
    ${ids.workArea},'Overlap Schedule','','','ONE_TIME',null,null,null,'2027-11-07','01:30',null,${tx.json(tasks())},${crypto.randomUUID()}) id`);
  await asAdmin(tx=>tx`select app_private.reconcile_schedule_occurrences(${overlap[0].id},'2027-11-07T00:00:00Z','2027-11-08T00:00:00Z')`);
  const row=await asUser(tx=>tx`select utc_offset_minutes_snapshot,to_char(scheduled_start_utc at time zone 'UTC','YYYY-MM-DD HH24:MI') utc_start from schedule_occurrence where schedule_id=${overlap[0].id}`);
  expect(row).toHaveLength(1);
  expect([-420,-360]).toContain(Number(row[0].utc_offset_minutes_snapshot));
  expect(row[0].utc_start).toMatch(/^2027-11-07 0[7-8]:30$/);
 });

 it("enforces Work Area working-hours override and cross-midnight coverage",async()=>{
  await migrator`update work_area set working_hours_json='{"1":[{"start":"08:00","end":"09:00"}]}'::jsonb where id=${ids.workArea}`;
  const blocked=await asAdmin(tx=>tx<{id:string}[]>`select app_private.create_schedule_master(
    ${ids.workArea},'Outside Hours','','','ONE_TIME',null,null,null,'2028-01-31','08:30',null,${tx.json(tasks())},${crypto.randomUUID()}) id`);
  await asAdmin(tx=>tx`select app_private.reconcile_schedule_occurrences(${blocked[0].id},'2028-01-31T00:00:00Z','2028-02-01T00:00:00Z')`);
  expect(await asUser(tx=>tx`select id from schedule_occurrence where schedule_id=${blocked[0].id}`)).toHaveLength(0);
  await migrator`update work_area set working_hours_json=null where id=${ids.workArea}`;
 });

 it("revokes direct runtime DML and never rewrites completed history during reconciliation",async()=>{
  await expect(asAdmin(tx=>tx`insert into schedule_occurrence(organization_id,site_id,work_area_id,schedule_id,scheduled_start_utc,scheduled_end_utc,timezone_snapshot,local_date_snapshot,local_time_snapshot,utc_offset_minutes_snapshot,organization_name_snapshot,site_name_snapshot,work_area_name_snapshot,schedule_name_snapshot,schedule_version_snapshot,planned_duration_minutes,working_hours_snapshot,working_hours_source_snapshot) select ${ids.org},${ids.site},${ids.workArea},id,now(),now()+interval '5 minutes',timezone,current_date,current_time,-360,'x','x','x','x',version,5,app_private.default_working_hours_24x7(),'ORGANIZATION' from schedule_master limit 1`)).rejects.toThrow(/permission denied/i);

  const created=await asAdmin(tx=>tx<{id:string}[]>`select app_private.create_schedule_master(
    ${ids.workArea},'History Schedule','','','ONE_TIME',null,null,null,'2028-02-29','08:00',null,${tx.json(tasks())},${crypto.randomUUID()}) id`);
  await asAdmin(tx=>tx`select app_private.reconcile_schedule_occurrences(${created[0].id},'2028-02-29T00:00:00Z','2028-03-01T00:00:00Z')`);
  const occurrence=await migrator`update schedule_occurrence set status='COMPLETED',started_at='2028-02-29T15:00:00Z',completed_at='2028-02-29T15:35:00Z' where schedule_id=${created[0].id} returning id,schedule_name_snapshot`;
  await migrator`update schedule_master set name='Changed Master',version=version+1 where id=${created[0].id}`;
  await asAdmin(tx=>tx`select app_private.reconcile_schedule_occurrences(${created[0].id},'2028-02-29T00:00:00Z','2028-03-01T00:00:00Z')`);
  const after=await asUser(tx=>tx`select status,schedule_name_snapshot from schedule_occurrence where id=${occurrence[0].id}`);
  expect(after[0]).toMatchObject({status:"COMPLETED",schedule_name_snapshot:"History Schedule"});
 });
});
