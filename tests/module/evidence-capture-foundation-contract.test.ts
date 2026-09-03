import fs from "node:fs";
import {describe,expect,it} from "vitest";

const sql=fs.readFileSync("drizzle/0016_evidence_capture_foundation.sql","utf8");
const storage=fs.readFileSync("supabase-storage/001_occurrence_evidence_private_bucket.sql","utf8");

describe("Evidence Capture & Media Pipeline Foundation contract",()=>{
 it("keeps Evidence metadata command-owned and RLS-backed",()=>{
  expect(sql).toMatch(/revoke insert,update,delete on public\.schedule_occurrence_evidence[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/grant select on public\.schedule_occurrence_evidence to vnext_runtime/i);
  expect(sql).toMatch(/create or replace function app_private\.create_evidence_upload_intent/i);
  expect(sql).toMatch(/create or replace function app_private\.finalize_evidence_upload/i);
 });
 it("binds upload intents to current USER execution and snapshotted evidence type",()=>{
  expect(sql).toContain("USER role is required to capture evidence");
  expect(sql).toContain("Only the active assigned membership may capture evidence");
  expect(sql).toContain("Evidence type does not match the snapshotted Task requirement");
  expect(sql).toContain("Evidence may be captured only for the current IN_PROGRESS Task");
 });
 it("defines safe media limits and PENDING verification after upload",()=>{
  expect(sql).toContain("PHOTO evidence cannot exceed 20 MB");
  expect(sql).toContain("VIDEO evidence cannot exceed 200 MB");
  expect(sql).toContain("'PENDING','INTENT'");
  expect(sql).toContain("verificationStatus','PENDING'");
 });
 it("exposes only auth-subject-aware Storage policy helpers to authenticated",()=>{
  expect(sql).toMatch(/storage_can_write_occurrence_evidence\([\s\S]*p_auth_subject text[\s\S]*security definer/i);
  expect(sql).toMatch(/storage_can_read_occurrence_evidence\([\s\S]*p_auth_subject text[\s\S]*security definer/i);
  expect(sql).toMatch(/grant execute on function public\.storage_can_write_occurrence_evidence[\s\S]*to authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.storage_can_read_occurrence_evidence[\s\S]*to authenticated/i);
 });
 it("keeps the Storage bucket private with no UPDATE/DELETE/public policy",()=>{
  expect(storage).toContain("'occurrence-evidence-private'");
  expect(storage).toMatch(/public,\s*file_size_limit[\s\S]*false,/i);
  expect(storage).toMatch(/for insert\s+to authenticated/i);
  expect(storage).toMatch(/for select\s+to authenticated/i);
  expect(storage).not.toMatch(/for update/i);
  expect(storage).not.toMatch(/for delete/i);
  expect(storage).not.toMatch(/to public/i);
 });
});
