import fs from "node:fs";
import {describe,expect,it} from "vitest";
const sql=fs.readFileSync("drizzle/0013_occurrence_execution_supersession.sql","utf8");
describe("Occurrence Execution & Supersession contract",()=>{
 it("keeps execution behind commands while direct runtime UPDATE remains absent",()=>{
  expect(sql).toMatch(/grant execute on function app_private\.claim_occurrence/i);
  expect(sql).toMatch(/grant execute on function app_private\.start_occurrence_with_qr/i);
  expect(sql).not.toMatch(/grant\s+update\s+on\s+public\.schedule_occurrence/i);
  expect(sql).toMatch(/revoke all on function app_private\.supersede_older_due_occurrences_internal[\s\S]*vnext_runtime/i);
 });
 it("enforces one active claimed or in-progress occurrence per Organization Membership",()=>{
  expect(sql).toContain("schedule_occurrence_one_active_membership_uq");
  expect(sql).toMatch(/organization_id,assigned_membership_id/i);
  expect(sql).toMatch(/claimed_at is not null or status='IN_PROGRESS'/i);
 });
 it("implements latest-due-wins without rewriting started work",()=>{
  expect(sql).toContain("SUPERSEDED_BY_LATER_DUE");
  expect(sql).toMatch(/status='PENDING'[\s\S]*started_at is null/i);
  expect(sql).toContain("OCCURRENCE_SUPERSEDED");
 });
 it("requires active matching QR and USER role for start",()=>{
  expect(sql).toMatch(/USER role is required to start work/i);
  expect(sql).toMatch(/q\.public_token=trim\(p_qr_public_token\)/i);
  expect(sql).toMatch(/q\.status='ACTIVE'/i);
  expect(sql).toMatch(/Occurrence must be claimed by the active membership first/i);
 });
});
