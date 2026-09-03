import fs from "node:fs";
import {describe,expect,it} from "vitest";
const sql=fs.readFileSync("drizzle/0014_occurrence_task_execution_completion.sql","utf8");

describe("Occurrence Task Execution security-hardening diagnostic contract",()=>{
 it("uses fixed SECURITY DEFINER search paths",()=>{
  const defs=sql.match(/security definer\s+set search_path = pg_catalog, public/gi)??[];
  expect(defs.length).toBeGreaterThanOrEqual(4);
 });
 it("keeps evidence verification outside direct runtime DML",()=>{
  expect(sql).toMatch(/revoke all on public\.schedule_occurrence_evidence[\s\S]*vnext_runtime/i);
  expect(sql).not.toMatch(/grant\s+(insert|update|delete)[\s\S]*schedule_occurrence_evidence[\s\S]*vnext_runtime/i);
 });
 it("keeps Task audit helper private and public execution commands narrow",()=>{
  expect(sql).toMatch(/revoke all on function app_private\.audit_occurrence_task_event[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/grant execute on function app_private\.complete_occurrence_task[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/grant execute on function app_private\.partially_complete_occurrence[\s\S]*vnext_runtime/i);
 });
});
