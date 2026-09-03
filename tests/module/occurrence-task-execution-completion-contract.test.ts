import fs from "node:fs";
import {describe,expect,it} from "vitest";
const sql=fs.readFileSync("drizzle/0014_occurrence_task_execution_completion.sql","utf8");

describe("Occurrence Task Execution & Completion contract",()=>{
 it("defines private evidence metadata with FORCE RLS and no runtime direct writes",()=>{
  expect(sql).toContain("create table if not exists public.schedule_occurrence_evidence");
  expect(sql).toContain("alter table public.schedule_occurrence_evidence force row level security");
  expect(sql).toMatch(/revoke all on public\.schedule_occurrence_evidence[\s\S]*vnext_runtime/i);
  expect(sql).not.toMatch(/grant\s+insert\s+on\s+public\.schedule_occurrence_evidence\s+to\s+vnext_runtime/i);
 });
 it("keeps Task completion behind a USER/context/idempotency boundary",()=>{
  expect(sql).toContain("app_private.complete_occurrence_task");
  expect(sql).toContain("Active tenant context is required");
  expect(sql).toContain("USER role is required to complete work");
  expect(sql).toContain("'OCCURRENCE_TASK_COMPLETE'");
  expect(sql).toContain("Occurrence Task version conflict");
 });
 it("requires verified evidence and derives terminal status on the server",()=>{
  expect(sql).toContain("Verified required evidence is missing for this Task");
  expect(sql).toContain("verification_status='VERIFIED'");
  expect(sql).toContain("set status='COMPLETED'");
  expect(sql).toContain("set status='PARTIALLY_COMPLETED'");
 });
 it("audits Task start/completion while keeping the helper private",()=>{
  expect(sql).toContain("'OCCURRENCE_TASK_STARTED'");
  expect(sql).toContain("'OCCURRENCE_TASK_COMPLETED'");
  expect(sql).toMatch(/revoke all on function app_private\.audit_occurrence_task_event[\s\S]*vnext_runtime/i);
 });
});
