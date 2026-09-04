import fs from "node:fs";
import {describe,expect,it} from "vitest";

const migration=fs.readFileSync("drizzle/0020_evidence_worker_media_execution_hardening.sql","utf8");
const deletionHardening=fs.readFileSync("drizzle/0021_evidence_storage_delete_confirmation_hardening.sql","utf8");
const grants=fs.readFileSync("scripts/db-apply-evidence-worker-capability-grants.mjs","utf8");
const transport=fs.readFileSync("worker/lib/evidence-transport.mjs","utf8");
const media=fs.readFileSync("worker/lib/evidence-media.mjs","utf8");
const loop=fs.readFileSync("worker/lib/evidence-worker-loop.mjs","utf8");
const main=fs.readFileSync("worker/evidence-worker.mjs","utf8");
const docker=fs.readFileSync("worker/Dockerfile","utf8");
const demo=fs.readFileSync("src/app/demo/page.tsx","utf8");
const pkg=fs.readFileSync("package.json","utf8");

describe("Evidence Worker Real Media Processing Foundation 03B2 contract",()=>{
  it("binds processing claims to the live outbox delivery and current Evidence version",()=>{
    expect(migration).toContain("claim_evidence_processing_for_event");
    expect(migration).toContain("p_event_claim_token");
    expect(migration).toContain("v_payload_version>e.version");
    expect(migration).toContain("e.processing_status='PROCESSING' and e.processing_lease_until>v_now");
    expect(grants).toMatch(/revoke execute on function app_private\.claim_evidence_processing\(uuid,bigint,text,text\)/i);
    expect(transport).toContain("claimProcessingForEvent");
    expect(transport).toContain("p_legacy_claim");
  });

  it("requires terminal aggregate state before acknowledging queue work and binds deletion acknowledgement to the live event",()=>{
    expect(migration).toContain("complete_evidence_worker_event_if_terminal");
    expect(migration).toContain("mark_evidence_original_deleted_for_event");
    expect(migration).toContain("e.verification_status in ('VERIFIED','REJECTED')");
    expect(migration).toContain("e.original_disposition='DELETED'");
    expect(grants).toMatch(/revoke execute on function app_private\.complete_evidence_worker_event\(uuid,uuid,text\)/i);
    expect(grants).toMatch(/revoke execute on function app_private\.mark_evidence_original_deleted\(uuid,bigint,text,text,text\)/i);
    expect(loop).toContain("completeEventIfTerminal");
    expect(loop).toContain("markOriginalDeletedForEvent");
  });

  it("independently observes source bytes and uses Sharp plus FFmpeg",()=>{
    expect(media).toContain('createHash("sha256")');
    expect(media).toContain("sniffContentType");
    expect(media).toContain("sharp(buffer");
    expect(media).toContain(".webp({quality:82");
    expect(media).toContain('"ffprobe"');
    expect(media).toContain('"libx264"');
    expect(media).toContain('"-movflags","+faststart"');
    expect(pkg).toContain('"sharp": "0.35.4"');
    expect(pkg).not.toContain("ffmpeg-static");
  });

  it("uses only server-owned derivative targets and keeps retry cleanup bounded",()=>{
    expect(loop).toContain("getProcessingTargets");
    expect(loop).toContain("targets.normalizedKey");
    expect(loop).toContain("targets.previewKey");
    expect(loop).not.toMatch(/organizationId.*normalized\.webp/s);
    expect(loop).toContain("releaseProcessingForRetry");
    expect(loop).toContain("computeRetrySeconds");
    expect(loop).toContain("bestEffortDerivativeCleanup");
  });

  it("requires worker SELECT visibility for original deletion and verifies physical removal",()=>{
    expect(deletionHardening).toContain("e.original_disposition='DELETE_QUEUED'");
    expect(deletionHardening).toContain("EVIDENCE_ORIGINAL_DELETE_REQUESTED");
    expect(deletionHardening).toContain("p_object_name=e.object_key");
    expect(deletionHardening).toContain("e.original_disposition<>'DELETED'");
    expect(transport).toContain("Storage original is not SELECT-visible to the worker before delete.");
    expect(transport).toContain("Storage delete returned success but the exact original object remains visible.");
    expect(transport).toContain(".list(");
  });

  it("supports a separate production worker container without a universal Storage credential",()=>{
    expect(docker).toContain("node:22-bookworm-slim");
    expect(docker).toMatch(/apt-get install[\s\S]*ffmpeg/);
    expect(docker).toContain("USER node");
    expect(docker).toContain('"--run"');
    expect(main).toContain('"--media-check"');
    expect(main).toContain('"--once"');
    expect(main).toContain('"--run"');
    expect(transport).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(transport).not.toMatch(/service[_-]?role/i);
    expect(transport).not.toContain("MIGRATION_DATABASE_URL");
  });

  it("keeps Demo parity synthetic and explicit",()=>{
    expect(demo).toContain("EVIDENCE MEDIA PROCESSING 03B2 DEMO");
    expect(demo).toContain("Sharp");
    expect(demo).toContain("FFmpeg");
    expect(demo).toContain("terminal-state");
    expect(demo).toContain("read-only");
  });
});
