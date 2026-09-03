import fs from "node:fs";
import {describe,expect,it} from "vitest";

const migration=fs.readFileSync("drizzle/0010_occurrence_foundation.sql","utf8");

describe("Occurrence Foundation contract",()=>{
 it("creates tenant-explicit occurrence snapshot tables with FORCE RLS",()=>{
  expect(migration).toMatch(/create table if not exists public\.schedule_occurrence/i);
  expect(migration).toMatch(/create table if not exists public\.schedule_occurrence_task/i);
  expect(migration).toMatch(/alter table public\.schedule_occurrence force row level security/i);
  expect(migration).toMatch(/alter table public\.schedule_occurrence_task force row level security/i);
  expect(migration).toMatch(/unique\(schedule_id,scheduled_start_utc\)/i);
 });
 it("keeps runtime writes behind the reconciliation command",()=>{
  expect(migration).toMatch(/grant select on public\.schedule_occurrence,public\.schedule_occurrence_task to vnext_runtime/i);
  expect(migration).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*schedule_occurrence/i);
  expect(migration).toMatch(/grant execute on function app_private\.reconcile_schedule_occurrences/i);
  expect(migration).toMatch(/revoke all on function app_private\.reconcile_schedule_occurrences_internal[\s\S]*from vnext_runtime/i);
 });
 it("snapshots time, working-hours, document, task, and evidence decisions",()=>{
  for(const token of[
   "timezone_snapshot","local_date_snapshot","local_time_snapshot","utc_offset_minutes_snapshot",
   "working_hours_snapshot","working_hours_source_snapshot","document_reference_snapshot",
   "document_revision_snapshot","task_instructions_snapshot","evidence_required","required_evidence_type"
  ]) expect(migration).toContain(token);
 });
 it("preserves history while reconciling only unstarted PENDING work",()=>{
  expect(migration).toMatch(/status='PENDING'[\s\S]*assigned_membership_id is null[\s\S]*started_at is null/i);
  expect(migration).toContain("SCHEDULE_RECONCILED");
  expect(migration).toMatch(/IN_PROGRESS\/completed\/history are never rewritten/i);
 });
});
