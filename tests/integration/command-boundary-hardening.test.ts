import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const migrationUrl=process.env.MIGRATION_DATABASE_URL;
if(!migrationUrl) throw new Error("MIGRATION_DATABASE_URL is required.");
const migrator=postgres(migrationUrl,{max:1,prepare:false,ssl:"require"});

describe("Task + Schedule command boundary hardening",()=>{
  afterAll(async()=>{await migrator.end({timeout:5});});

  it("removes direct runtime DML from Task and Schedule masters/children",async()=>{
    const rows=await migrator`
      select
        has_table_privilege('vnext_runtime','public.task_master','SELECT') task_select,
        has_table_privilege('vnext_runtime','public.task_master','INSERT') task_insert,
        has_table_privilege('vnext_runtime','public.task_master','UPDATE') task_update,
        has_table_privilege('vnext_runtime','public.schedule_master','SELECT') schedule_select,
        has_table_privilege('vnext_runtime','public.schedule_master','INSERT') schedule_insert,
        has_table_privilege('vnext_runtime','public.schedule_master','UPDATE') schedule_update,
        has_table_privilege('vnext_runtime','public.schedule_task','SELECT') schedule_task_select,
        has_table_privilege('vnext_runtime','public.schedule_task','INSERT') schedule_task_insert,
        has_table_privilege('vnext_runtime','public.schedule_task','UPDATE') schedule_task_update,
        has_table_privilege('vnext_runtime','public.schedule_task','DELETE') schedule_task_delete
    `;
    expect(rows[0]).toMatchObject({
      task_select:true,task_insert:false,task_update:false,
      schedule_select:true,schedule_insert:false,schedule_update:false,
      schedule_task_select:true,schedule_task_insert:false,schedule_task_update:false,schedule_task_delete:false,
    });
  });

  it("keeps audited command functions executable but hides the Schedule child helper",async()=>{
    const rows=await migrator`
      select
        has_function_privilege('vnext_runtime','app_private.create_task_master(text,text,text)','EXECUTE') task_create,
        has_function_privilege('vnext_runtime','app_private.update_task_master(uuid,text,text,bigint)','EXECUTE') task_update,
        has_function_privilege('vnext_runtime','app_private.set_task_master_status(uuid,record_status,bigint)','EXECUTE') task_status,
        has_function_privilege(
          'vnext_runtime',
          'app_private.create_schedule_master(uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,text)',
          'EXECUTE'
        ) schedule_create,
        has_function_privilege(
          'vnext_runtime',
          'app_private.update_schedule_master(uuid,uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,bigint)',
          'EXECUTE'
        ) schedule_update,
        has_function_privilege('vnext_runtime','app_private.set_schedule_master_status(uuid,record_status,bigint)','EXECUTE') schedule_status,
        has_function_privilege('vnext_runtime','app_private.insert_schedule_tasks(uuid,uuid,uuid,uuid,jsonb)','EXECUTE') helper_execute
    `;
    expect(rows[0]).toMatchObject({
      task_create:true,task_update:true,task_status:true,
      schedule_create:true,schedule_update:true,schedule_status:true,
      helper_execute:false,
    });
  });

  it("runs command functions as SECURITY DEFINER with a fixed search_path",async()=>{
    const rows=await migrator`
      select p.proname,p.prosecdef,pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='app_private'
        and p.proname in (
          'create_task_master','update_task_master','set_task_master_status',
          'create_schedule_master','update_schedule_master','set_schedule_master_status',
          'insert_schedule_tasks'
        )
    `;
    expect(rows).toHaveLength(7);
    for(const row of rows){
      expect(row.prosecdef).toBe(true);
      expect(row.definition).toMatch(/SET search_path TO 'pg_catalog', 'public'/i);
    }
  });
});
