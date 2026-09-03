import postgres from "postgres";
import {afterAll,describe,expect,it} from "vitest";
const runtimeUrl=process.env.DATABASE_URL,migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!runtimeUrl||!migrationUrl)throw new Error("Database URLs are required.");
const runtime=postgres(runtimeUrl,{max:6,prepare:false,ssl:"require"}),migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});
const ids={org:"",adminUser:"",adminMembership:"",managerUser:"",managerMembership:"",userUser:"",userMembership:"",siteA:"",siteB:"",workAreaA:"",workAreaB:"",taskA:"",taskB:"",schedule:""};

async function asContext<T>(userId:string,membershipId:string,fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>){return runtime.begin(async tx=>{await tx`select set_config('app.user_id',${userId},true)`;await tx`select set_config('app.organization_id',${ids.org},true)`;await tx`select set_config('app.membership_id',${membershipId},true)`;return fn(tx)}) as Promise<T>}
const asAdmin=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>asContext(ids.adminUser,ids.adminMembership,fn);
const asManager=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>asContext(ids.managerUser,ids.managerMembership,fn);
const asUser=<T>(fn:(tx:postgres.TransactionSql<{}>)=>Promise<T>)=>asContext(ids.userUser,ids.userMembership,fn);
const taskPayload=()=>[
 {taskId:ids.taskA,sequence:1,plannedDurationMinutes:20,evidenceRule:"PHOTO",randomEveryN:null,randomEvidenceType:null},
 {taskId:ids.taskB,sequence:2,plannedDurationMinutes:15,evidenceRule:"RANDOM",randomEveryN:3,randomEvidenceType:"EITHER"}
];

describe("Schedule Master Foundation database boundary",()=>{
 afterAll(async()=>{
  if(ids.org){
   await migrator`delete from audit_event where organization_id=${ids.org}`;await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
   await migrator`delete from schedule_task where organization_id=${ids.org}`;await migrator`delete from schedule_master where organization_id=${ids.org}`;
   await migrator`delete from task_attachment where organization_id=${ids.org}`;await migrator`delete from task_master where organization_id=${ids.org}`;
   await migrator`delete from work_area_qr where organization_id=${ids.org}`;await migrator`delete from work_area where organization_id=${ids.org}`;
   await migrator`delete from site_membership_scope where organization_id=${ids.org}`;await migrator`delete from organization_membership where organization_id=${ids.org}`;
   await migrator`delete from site where organization_id=${ids.org}`;await migrator`delete from organization where id=${ids.org}`;
  }
  for(const id of[ids.adminUser,ids.managerUser,ids.userUser])if(id)await migrator`delete from app_user where id=${id}`;
  await runtime.end({timeout:5});await migrator.end({timeout:5});
 });

 it("creates scoped ADMIN, SITE_MANAGER, USER, Sites, Work Areas, and Tasks",async()=>{
  const suffix=Date.now().toString();
  const rows=await migrator`
   with o as(insert into organization(name,country_code,default_currency_code,default_timezone) values(${`Schedule Org ${suffix}`},'US','USD','America/Denver') returning id),
   au as(insert into app_user(auth_subject,email,display_name) values(${`schedule-admin-${suffix}`},${`schedule-admin-${suffix}@example.test`},'Schedule Admin') returning id),
   mu as(insert into app_user(auth_subject,email,display_name) values(${`schedule-manager-${suffix}`},${`schedule-manager-${suffix}@example.test`},'Schedule Manager') returning id),
   uu as(insert into app_user(auth_subject,email,display_name) values(${`schedule-user-${suffix}`},${`schedule-user-${suffix}@example.test`},'Schedule User') returning id),
   am as(insert into organization_membership(organization_id,user_id,role_code) select o.id,au.id,'ADMIN'::membership_role from o,au returning id),
   mm as(insert into organization_membership(organization_id,user_id,role_code) select o.id,mu.id,'SITE_MANAGER'::membership_role from o,mu returning id),
   um as(insert into organization_membership(organization_id,user_id,role_code) select o.id,uu.id,'USER'::membership_role from o,uu returning id),
   sa as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Assigned Site','SCH-A','America/Denver','US' from o returning id),
   sb as(insert into site(organization_id,name,code,timezone,country_code) select o.id,'Unassigned Site','SCH-B','America/New_York','US' from o returning id)
   select o.id org_id,au.id admin_user,am.id admin_membership,mu.id manager_user,mm.id manager_membership,uu.id user_user,um.id user_membership,sa.id site_a,sb.id site_b from o,au,am,mu,mm,uu,um,sa,sb`;
  const r=rows[0];Object.assign(ids,{org:r.org_id,adminUser:r.admin_user,adminMembership:r.admin_membership,managerUser:r.manager_user,managerMembership:r.manager_membership,userUser:r.user_user,userMembership:r.user_membership,siteA:r.site_a,siteB:r.site_b});
  await migrator`insert into site_membership_scope(organization_id,site_id,membership_id) values(${ids.org},${ids.siteA},${ids.managerMembership}),(${ids.org},${ids.siteA},${ids.userMembership})`;
  const areas=await migrator`insert into work_area(organization_id,site_id,name,code,status) values(${ids.org},${ids.siteA},'Main Lobby','LOBBY','ACTIVE'),(${ids.org},${ids.siteB},'East Lobby','EAST','ACTIVE') returning id,site_id`;
  ids.workAreaA=areas.find(x=>x.site_id===ids.siteA)!.id;ids.workAreaB=areas.find(x=>x.site_id===ids.siteB)!.id;
  const tasks=await migrator`insert into task_master(organization_id,name,instructions_html,status) values(${ids.org},'Clean entrance glass','<p>Clean both sides.</p>','ACTIVE'),(${ids.org},'Restock lobby supplies','<p>Check minimum stock.</p>','ACTIVE') returning id,name`;
  ids.taskA=tasks.find(x=>x.name==="Clean entrance glass")!.id;ids.taskB=tasks.find(x=>x.name==="Restock lobby supplies")!.id;
  expect(ids.workAreaA).toBeTruthy();
 });

 it("creates idempotently, snapshots Site timezone/local DST-gap intent, and calculates ordered offsets",async()=>{
  const key=crypto.randomUUID();
  const create=()=>asAdmin(tx=>tx<{create_schedule_master:string}[]>`select app_private.create_schedule_master(
   ${ids.workAreaA},'Morning Lobby Readiness','SOP-HK-004','Rev 03','ONE_TIME'::schedule_frequency_type,
   null::schedule_recurrence_unit,null::integer,null::jsonb,'2027-03-14'::date,'02:30'::time,null::date,${tx.json(taskPayload())},${key})`);
  const first=await create(),second=await create();ids.schedule=first[0].create_schedule_master;expect(second[0].create_schedule_master).toBe(ids.schedule);
  const master=await asAdmin(tx=>tx`select name,timezone,start_local_date::text,to_char(start_local_time,'HH24:MI') start_local_time,status,version from schedule_master where id=${ids.schedule}`);
  expect(master[0]).toMatchObject({name:"Morning Lobby Readiness",timezone:"America/Denver",start_local_date:"2027-03-14",start_local_time:"02:30",status:"ACTIVE"});expect(Number(master[0].version)).toBe(1);
  const items=await asAdmin(tx=>tx`select sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes,evidence_rule,random_every_n,random_evidence_type from schedule_task where schedule_id=${ids.schedule} order by sequence`);
  expect(items[0]).toMatchObject({sequence:1,planned_duration_minutes:20,planned_start_offset_minutes:0,planned_end_offset_minutes:20,evidence_rule:"PHOTO"});
  expect(items[1]).toMatchObject({sequence:2,planned_duration_minutes:15,planned_start_offset_minutes:20,planned_end_offset_minutes:35,evidence_rule:"RANDOM",random_every_n:3,random_evidence_type:"EITHER"});
 });

 it("validates WEEK/MONTH recurrence, Jan 31, Feb 29, and inclusive local end date",async()=>{
  await asAdmin(tx=>tx`select app_private.validate_schedule_recurrence('RECURRING','WEEK',1,'{"weekdays":[1,3,5]}'::jsonb,'2028-02-29','2028-03-31')`);
  await asAdmin(tx=>tx`select app_private.validate_schedule_recurrence('RECURRING','MONTH',1,'{"monthDays":[1,15,31]}'::jsonb,'2028-01-31','2028-12-31')`);
  await expect(asAdmin(tx=>tx`select app_private.validate_schedule_recurrence('RECURRING','WEEK',1,'{"weekdays":[]}'::jsonb,'2028-02-29','2028-03-31')`)).rejects.toThrow(/weekday/i);
 });

 it("enforces specific Site scope and USER read-only Schedule access",async()=>{
  const allowed=await asManager(tx=>tx<{allowed:boolean}[]>`select app_private.can_manage_schedule_site(${ids.siteA}) allowed`),denied=await asManager(tx=>tx<{allowed:boolean}[]>`select app_private.can_manage_schedule_site(${ids.siteB}) allowed`);
  expect(allowed[0].allowed).toBe(true);expect(denied[0].allowed).toBe(false);
  expect((await asUser(tx=>tx`select id from schedule_master where id=${ids.schedule}`))[0].id).toBe(ids.schedule);
  await expect(asUser(tx=>tx`update schedule_master set name='Forbidden' where id=${ids.schedule} returning id`)).rejects.toThrow(/permission denied/i);
  await expect(asManager(tx=>tx`select app_private.create_schedule_master(${ids.workAreaB},'Forbidden','','','ONE_TIME',null,null,null,'2028-01-31','08:00',null,${tx.json(taskPayload())},${crypto.randomUUID()})`)).rejects.toThrow();
 });

 it("keeps historical read scope when Site is inactive but blocks new Schedule creation",async()=>{
  await migrator`update site set status='INACTIVE' where id=${ids.siteA}`;
  expect((await asManager(tx=>tx`select id from schedule_master where id=${ids.schedule}`))[0].id).toBe(ids.schedule);
  await expect(asManager(tx=>tx`select app_private.create_schedule_master(${ids.workAreaA},'Blocked','','','ONE_TIME',null,null,null,'2028-01-31','09:00',null,${tx.json(taskPayload())},${crypto.randomUUID()})`)).rejects.toThrow(/active/i);
  await migrator`update site set status='ACTIVE' where id=${ids.siteA}`;
 });

 it("blocks inactive Tasks from new composition",async()=>{
  await migrator`update task_master set status='INACTIVE' where id=${ids.taskB}`;
  await expect(asAdmin(tx=>tx`select app_private.create_schedule_master(${ids.workAreaA},'Blocked Task','','','ONE_TIME',null,null,null,'2028-01-31','10:00',null,${tx.json(taskPayload())},${crypto.randomUUID()})`)).rejects.toThrow(/active/i);
  await migrator`update task_master set status='ACTIVE' where id=${ids.taskB}`;
 });

 it("updates composition with optimistic versioning and audits old/new values",async()=>{
  const before=await asManager(tx=>tx<{version:string}[]>`select version from schedule_master where id=${ids.schedule}`);
  const changed=[{taskId:ids.taskB,sequence:1,plannedDurationMinutes:25,evidenceRule:"NONE",randomEveryN:null,randomEvidenceType:null},{taskId:ids.taskA,sequence:2,plannedDurationMinutes:10,evidenceRule:"VIDEO",randomEveryN:null,randomEvidenceType:null}];
  await asManager(tx=>tx`select app_private.update_schedule_master(${ids.schedule},${ids.workAreaA},'Morning Lobby Readiness Updated','SOP-HK-004','Rev 04','RECURRING','WEEK',1,'{"weekdays":[1,2,3,4,5]}'::jsonb,'2028-02-29','08:00','2028-12-31',${tx.json(changed)},${Number(before[0].version)})`);
  await expect(asManager(tx=>tx`select app_private.update_schedule_master(${ids.schedule},${ids.workAreaA},'Stale','','','ONE_TIME',null,null,null,'2028-01-31','08:00',null,${tx.json(taskPayload())},${Number(before[0].version)})`)).rejects.toThrow(/changed by another user/i);
  const items=await asAdmin(tx=>tx`select task_id,sequence,planned_duration_minutes,planned_start_offset_minutes,planned_end_offset_minutes from schedule_task where schedule_id=${ids.schedule} order by sequence`);
  expect(items[0]).toMatchObject({task_id:ids.taskB,sequence:1,planned_duration_minutes:25,planned_start_offset_minutes:0,planned_end_offset_minutes:25});
  const audit=await migrator`select old_value_json,new_value_json from audit_event where organization_id=${ids.org} and action_code='SCHEDULE_UPDATED' order by timestamp_utc desc limit 1`;
  expect(audit[0].old_value_json.documentRevision).toBe("Rev 03");expect(audit[0].new_value_json.documentRevision).toBe("Rev 04");expect(audit[0].old_value_json.tasks).toHaveLength(2);expect(audit[0].new_value_json.tasks).toHaveLength(2);
 });

 it("uses soft lifecycle, blocks unsafe reactivation, fails closed, and records audit actions",async()=>{
  const before=await asAdmin(tx=>tx<{version:string}[]>`select version from schedule_master where id=${ids.schedule}`);
  await asAdmin(tx=>tx`select app_private.set_schedule_master_status(${ids.schedule},'INACTIVE',${Number(before[0].version)})`);
  await migrator`update work_area set status='INACTIVE' where id=${ids.workAreaA}`;
  const v=await asAdmin(tx=>tx<{version:string}[]>`select version from schedule_master where id=${ids.schedule}`);
  await expect(asAdmin(tx=>tx`select app_private.set_schedule_master_status(${ids.schedule},'ACTIVE',${Number(v[0].version)})`)).rejects.toThrow(/active/i);
  await migrator`update work_area set status='ACTIVE' where id=${ids.workAreaA}`;
  expect(await runtime`select id from schedule_master where id=${ids.schedule}`).toHaveLength(0);
  const audit=await migrator`select action_code from audit_event where organization_id=${ids.org} and module_code='SCHEDULE' order by timestamp_utc,id`;
  const actions=audit.map(x=>x.action_code);expect(actions).toContain("SCHEDULE_CREATED");expect(actions).toContain("SCHEDULE_UPDATED");expect(actions).toContain("SCHEDULE_STATUS_CHANGED");
 });
});
