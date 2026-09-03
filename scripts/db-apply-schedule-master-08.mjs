import fs from "node:fs";
import postgres from "postgres";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("MIGRATION_DATABASE_URL is missing.");
const sql=postgres(url,{max:1,prepare:false,ssl:"require"});
try{
 await sql.unsafe(fs.readFileSync("drizzle/0008_schedule_master_foundation.sql","utf8"));
 const rows=await sql`
  select
   to_regclass('public.schedule_master') is not null as schedule_table,
   to_regclass('public.schedule_task') is not null as schedule_task_table,
   to_regprocedure('app_private.can_manage_schedule_site(uuid)') is not null as manage_helper,
   to_regprocedure('app_private.create_schedule_master(uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,text)') is not null as create_fn,
   to_regprocedure('app_private.update_schedule_master(uuid,uuid,text,text,text,schedule_frequency_type,schedule_recurrence_unit,integer,jsonb,date,time without time zone,date,jsonb,bigint)') is not null as update_fn,
   to_regprocedure('app_private.set_schedule_master_status(uuid,record_status,bigint)') is not null as status_fn`;
 if(!Object.values(rows[0]).every(Boolean))throw new Error("Schedule Master Foundation verification failed.");
 const rls=await sql`
  select relname,relrowsecurity,relforcerowsecurity from pg_class
  where oid in ('public.schedule_master'::regclass,'public.schedule_task'::regclass) order by relname`;
 if(rls.length!==2||rls.some(r=>!r.relrowsecurity||!r.relforcerowsecurity))
  throw new Error("Schedule Master RLS/FORCE RLS verification failed.");
 console.log("Schedule Master Foundation 01 applied and verified.");
}finally{await sql.end({timeout:5});}
