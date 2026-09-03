import fs from "node:fs";
import {describe,expect,it} from "vitest";
const sql=fs.readFileSync("drizzle/0013_occurrence_execution_supersession.sql","utf8");
describe("Occurrence Execution security hardening contract",()=>{
 it("keeps public execution commands role/context guarded",()=>{
  expect(sql).toMatch(/Active tenant context is required/);
  expect(sql).toMatch(/USER role is required to claim work/);
  expect(sql).toMatch(/USER role is required to start work/);
 });
 it("keeps internal helpers closed and direct runtime DML absent",()=>{
  expect(sql).toMatch(/revoke all on function app_private\.audit_execution_event[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/revoke all on function app_private\.supersede_older_due_occurrences_internal[\s\S]*vnext_runtime/i);
  expect(sql).not.toMatch(/grant\s+update\s+on\s+public\.schedule_occurrence/i);
  expect(sql).not.toMatch(/grant\s+update\s+on\s+public\.schedule_occurrence_task/i);
 });
 it("locks idempotency and active membership claim domains",()=>{
  expect(sql).toContain("'OCCURRENCE_CLAIM'");
  expect(sql).toContain("'ACTIVE_WORK'");
  expect(sql).toContain("schedule_occurrence_one_active_membership_uq");
 });
 it("requires exact active Work Area QR and active lifecycle at start",()=>{
  expect(sql).toMatch(/q\.work_area_id=occ\.work_area_id/i);
  expect(sql).toMatch(/q\.status='ACTIVE'/i);
  expect(sql).toMatch(/s\.status='ACTIVE'[\s\S]*w\.status='ACTIVE'[\s\S]*sm\.status='ACTIVE'/i);
 });
});
