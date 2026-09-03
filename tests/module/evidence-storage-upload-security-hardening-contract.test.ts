import fs from "node:fs";
import {describe,expect,it} from "vitest";

const component=fs.readFileSync("src/app/workspace/my-work/evidence-capture.tsx","utf8");
const storage=fs.readFileSync("supabase-storage/001_occurrence_evidence_private_bucket.sql","utf8");
const sql=fs.readFileSync("drizzle/0016_evidence_capture_foundation.sql","utf8");

describe("Evidence Storage upload security hardening",()=>{
 it("uses authenticated direct Storage INSERT instead of a long-lived signed upload token",()=>{
  expect(component).toMatch(/\.from\(intent\.storageBucket\)[\s\S]*\.upload\(intent\.objectKey,file/);
  expect(component).not.toContain("createSignedUploadUrl");
  expect(component).not.toContain("uploadToSignedUrl");
  expect(component).toContain("Storage RLS INSERT policy is therefore evaluated at the actual upload");
 });
 it("keeps the Storage write policy tied to the short-lived Evidence intent helper",()=>{
  expect(storage).toMatch(/for insert\s+to authenticated\s+with check/i);
  expect(storage).toContain("storage_can_write_occurrence_evidence");
  expect(sql).toMatch(/e\.upload_status='INTENT'/);
  expect(sql).toMatch(/e\.upload_expires_at>now\(\)/);
 });
 it("retains no Storage UPDATE, DELETE, or public evidence policy",()=>{
  expect(storage).not.toMatch(/for update/i);
  expect(storage).not.toMatch(/for delete/i);
  expect(storage).not.toMatch(/to public/i);
  expect(storage).toMatch(/for select\s+to authenticated/i);
 });
});
