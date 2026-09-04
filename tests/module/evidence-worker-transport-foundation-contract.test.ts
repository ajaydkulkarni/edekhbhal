import fs from "node:fs";
import {describe,expect,it} from "vitest";

const migration=fs.readFileSync("drizzle/0019_evidence_worker_transport_foundation.sql","utf8");
const storage=fs.readFileSync("supabase-storage/002_occurrence_evidence_worker_transport.sql","utf8");
const grants=fs.readFileSync("scripts/db-apply-evidence-worker-capability-grants.mjs","utf8");
const worker=fs.readFileSync("worker/lib/evidence-transport.mjs","utf8");
const main=fs.readFileSync("worker/evidence-worker.mjs","utf8");
const pkg=fs.readFileSync("package.json","utf8");

describe("Evidence Worker Transport Foundation 03B1 contract",()=>{
 it("uses a dedicated machine-principal mapping without tenant membership",()=>{
  expect(migration).toContain("app_private.evidence_worker_storage_principal");
  expect(migration).toContain("assert_evidence_worker_storage_principal");
  expect(migration).toContain("p.auth_subject::text=p_auth_subject");
  expect(migration).toContain("p.status='ACTIVE'");
 });
 it("binds Storage access to live queue and processing leases",()=>{
  expect(migration).toContain("storage_worker_can_read_occurrence_evidence");
  expect(migration).toContain("storage_worker_can_write_occurrence_evidence");
  expect(migration).toContain("storage_worker_can_delete_occurrence_evidence");
  expect(migration).toMatch(/evt\.worker_lease_until>now\(\)/);
  expect(migration).toMatch(/e\.processing_lease_until>now\(\)/);
  expect(storage).toContain("occurrence_evidence_worker_select");
  expect(storage).toContain("occurrence_evidence_worker_insert");
  expect(storage).toContain("occurrence_evidence_worker_update");
  expect(storage).toContain("occurrence_evidence_worker_delete");
 });
 it("adds bounded heartbeats without weakening stale-token checks",()=>{
  expect(migration).toContain("renew_evidence_worker_event_lease");
  expect(migration).toContain("renew_evidence_processing_lease");
  expect(migration).toContain("Worker event claim mismatch");
  expect(migration).toContain("Processing claim token mismatch");
  expect(migration).toMatch(/p_lease_seconds>300/);
 });
 it("server-selects deterministic derivative targets",()=>{
  expect(migration).toContain("get_evidence_processing_targets");
  expect(migration).toContain("normalized.webp");
  expect(migration).toContain("preview.webp");
  expect(migration).toContain("normalized.mp4");
  expect(migration).toContain("preview.jpg");
  expect(migration).toContain("complete_evidence_processing_transport");
 });
 it("revokes the older free-form completion command from the worker capability role",()=>{
  expect(grants).toMatch(/revoke execute on function app_private\.complete_evidence_processing\(/i);
  expect(grants).toContain("complete_evidence_processing_transport");
  expect(grants).toContain("legacy_complete");
  expect(grants).toContain("Worker must not retain the legacy free-form Evidence completion command.");
 });
 it("uses publishable-key Auth for Storage and never embeds a service credential",()=>{
  expect(worker).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  expect(worker).toContain("signInWithPassword");
  expect(worker).toContain("EVIDENCE_STORAGE_WORKER_EMAIL");
  expect(worker).toContain("EVIDENCE_STORAGE_WORKER_PASSWORD");
  expect(worker).not.toMatch(/service[_-]?role/i);
  expect(worker).not.toContain("MIGRATION_DATABASE_URL");
  expect(storage).not.toMatch(/service[_-]?role/i);
 });
 it("keeps 03B1 transport-only and defers codecs/queue loop to 03B2",()=>{
  expect(main).toContain("queue-processing loop and real image/video codecs are intentionally disabled");
  expect(pkg).not.toContain('"sharp"');
  expect(pkg).not.toContain("ffmpeg-static");
 });
});
