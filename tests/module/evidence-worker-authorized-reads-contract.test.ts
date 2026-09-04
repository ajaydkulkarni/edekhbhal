import fs from "node:fs";
import {describe,expect,it} from "vitest";

const sql=fs.readFileSync("drizzle/0018_evidence_worker_authorized_reads.sql","utf8");
const roleSql=fs.readFileSync("supabase-privileged/002_evidence_worker_capability_role.sql","utf8");
const grants=fs.readFileSync("scripts/db-apply-evidence-worker-capability-grants.mjs","utf8");
const route=fs.readFileSync("src/app/workspace/evidence/[id]/route.ts","utf8");

describe("Evidence Worker Queue & Authorized Reads Foundation 03A contract",()=>{
 it("leases only Evidence outbox events and uses SKIP LOCKED",()=>{
  expect(sql).toContain("claim_evidence_worker_event");
  expect(sql).toMatch(/for update skip locked/i);
  expect(sql).toContain("EVIDENCE_PROCESS_REQUESTED");
  expect(sql).toContain("EVIDENCE_ORIGINAL_DELETE_REQUESTED");
  expect(sql).toContain("worker_claim_token");
  expect(sql).toContain("worker_lease_until");
 });
 it("keeps worker commands unavailable to normal runtime",()=>{
  expect(sql).toMatch(/revoke all on function app_private\.claim_evidence_worker_event[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/revoke all on function app_private\.mark_evidence_original_deleted[\s\S]*vnext_runtime/i);
 });
 it("splits role creation from owner-controlled capability grants",()=>{
  expect(roleSql).toMatch(/create role vnext_evidence_worker nologin/i);
  expect(roleSql).toContain("rolbypassrls");
  expect(roleSql).not.toMatch(/grant execute on function/i);
  expect(grants).toContain("grant usage on schema app_private");
  expect(grants).toContain("claim_evidence_worker_event");
  expect(grants).toContain("complete_evidence_processing");
  expect(grants).toContain("mark_evidence_original_deleted");
  expect(grants).toMatch(/no direct sensitive-table grants/i);
 });
 it("verifies worker role cannot use application Evidence-read commands",()=>{
  expect(grants).toContain("authorize_occurrence_evidence_read");
  expect(grants).toContain("audit_evidence_read_url_issued");
  expect(grants).toContain("Worker role must not receive application Evidence-read capabilities.");
 });
 it("authorizes evidence reads in the application before signing for at most 60 seconds",()=>{
  expect(route).toContain("authorize_occurrence_evidence_read");
  expect(route).toMatch(/createSignedUrl\(auth\.result_object_key,expiresSeconds\)/);
  expect(route).toContain("Math.min(60");
  expect(route).toContain("audit_evidence_read_url_issued");
  expect(route).not.toContain("SERVICE_ROLE");
  expect(route).not.toContain("service_role");
 });
 it("keeps the public QR out of the Evidence read route",()=>{
  expect(route).toContain("/workspace/occurrences?evidenceError=");
  expect(route).not.toContain("/q/");
 });
});
