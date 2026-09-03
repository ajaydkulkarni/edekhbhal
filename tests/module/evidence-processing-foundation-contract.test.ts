import fs from "node:fs";
import {describe,expect,it} from "vitest";

const sql=fs.readFileSync("drizzle/0017_evidence_processing_foundation.sql","utf8");
const apply=fs.readFileSync("scripts/db-apply-evidence-processing-17.mjs","utf8");

describe("Evidence Verification & Media Normalization Foundation 02 contract",()=>{
 it("atomically queues processing from upload finalization",()=>{
  expect(sql).toMatch(/processing_status='QUEUED'/);
  expect(sql).toContain("'EVIDENCE_PROCESS_REQUESTED'");
  expect(sql).toMatch(/insert into public\.outbox_event/);
  expect(sql).toContain("evidence-process:");
 });
 it("defines lease/token processor commands without granting them to normal runtime",()=>{
  expect(sql).toContain("claim_evidence_processing");
  expect(sql).toContain("complete_evidence_processing");
  expect(sql).toContain("processing_lease_until");
  expect(sql).toContain("processing_claim_token");
  expect(sql).toMatch(/revoke all on function app_private\.claim_evidence_processing[\s\S]*vnext_runtime/i);
  expect(sql).toMatch(/revoke all on function app_private\.complete_evidence_processing[\s\S]*vnext_runtime/i);
 });
 it("requires processor verification of source metadata before VERIFIED",()=>{
  expect(sql).toContain("Observed content type does not match uploaded Evidence metadata");
  expect(sql).toContain("Observed byte size does not match uploaded Evidence metadata");
  expect(sql).toContain("Observed checksum does not match uploaded Evidence metadata");
 });
 it("enforces normalized derivative and original-retention contracts",()=>{
  expect(sql).toContain("Normalized object key must remain Organization-scoped");
  expect(sql).toContain("Normalized PHOTO must be JPEG or WebP");
  expect(sql).toContain("Normalized VIDEO must be MP4");
  expect(sql).toContain("'EVIDENCE_ORIGINAL_DELETE_REQUESTED'");
  expect(sql).toContain("'DELETE_QUEUED'");
 });
 it("apply runner verifies runtime cannot invoke processor commands",()=>{
  expect(apply).toContain("Runtime must not execute processor commands.");
  expect(apply).toContain("Processor command functions are intentionally ungranted");
 });
});
