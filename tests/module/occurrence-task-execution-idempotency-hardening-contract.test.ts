import fs from "node:fs";
import {describe,expect,it} from "vitest";
const sql=fs.readFileSync("drizzle/0015_occurrence_task_execution_idempotency_hardening.sql","utf8");
describe("Occurrence Task Execution idempotency hardening contract",()=>{
 it("binds Task-completion replay to id, version, normalized notes and source",()=>{
  expect(sql).toContain("'expectedVersion',p_expected_version");
  expect(sql).toContain("'notes',coalesce(clean_notes,'')");
  expect(sql).toContain("'sourceChannel',p_source_channel");
  expect(sql).toContain("another Task completion request");
 });
 it("binds partial-completion replay to id, version, reason and source",()=>{
  expect(sql).toContain("'reason',clean_reason");
  expect(sql).toContain("another partial completion request");
 });
 it("retains fixed SECURITY DEFINER search paths and narrow grants",()=>{
  expect(sql.match(/security definer\s+set search_path = pg_catalog, public/gi)?.length).toBe(2);
  expect(sql).toMatch(/grant execute on function app_private\.complete_occurrence_task[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/grant execute on function app_private\.partially_complete_occurrence[\s\S]*vnext_runtime/i);
 });
});
