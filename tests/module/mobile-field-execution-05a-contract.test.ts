import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const server=readFileSync(
 "src/lib/work-execution/server.ts",
 "utf8"
);

const actions=readFileSync(
 "src/lib/work-execution/actions.ts",
 "utf8"
);

describe("Mobile Field Execution Foundation 05A server adapter",()=>{
 it("adds an exact visible My Work occurrence reader",()=>{
  expect(server).toContain(
   "export async function getMyWorkOccurrence("
  );
  expect(server).toContain(
   "where o.id=${occurrenceId}"
  );
  expect(server).toContain(
   "o.assigned_membership_id=app_private.current_membership_id()"
  );
 });

 it("keeps focused task navigation reads non-mutating",()=>{
  const focusedReader=server.slice(
   server.indexOf(
    "export async function getMyWorkOccurrence("
   ),
   server.indexOf(
    "export async function listOccurrenceTasks("
   )
  );

  expect(focusedReader).not.toContain(
   "apply_due_supersession"
  );

  expect(focusedReader).toContain(
   "where o.id=${occurrenceId}"
  );
 });

 it("provides MOBILE claim and QR-start wrappers",()=>{
  expect(actions).toContain(
   "export async function claimOccurrenceMobile("
  );
  expect(actions).toContain(
   "export async function startOccurrenceMobile("
  );
  expect(actions).toMatch(
   /claim_occurrence\([^)]*'MOBILE'/s
  );
  expect(actions).toMatch(
   /start_occurrence_with_qr\([^)]*'MOBILE'/s
  );
 });

 it("provides MOBILE Task terminal wrappers",()=>{
  expect(actions).toContain(
   "export async function completeOccurrenceTaskMobile("
  );
  expect(actions).toContain(
   "export async function partiallyCompleteOccurrenceMobile("
  );
  expect(actions).toMatch(
   /complete_occurrence_task\([^)]*'MOBILE'/s
  );
  expect(actions).toMatch(
   /partially_complete_occurrence\([^)]*'MOBILE'/s
  );
 });

 it("provides server-selected MOBILE Evidence wrappers",()=>{
  expect(actions).toContain(
   "export async function createMobileEvidenceUploadIntent("
  );
  expect(actions).toContain(
   "export async function finalizeMobileEvidenceUpload("
  );
  expect(actions).toMatch(
   /create_evidence_upload_intent\([^)]*'MOBILE'/s
  );
  const mobileFinalize=actions.slice(
   actions.indexOf(
    "export async function finalizeMobileEvidenceUpload("
   )
  );

  expect(mobileFinalize).toContain(
   "select app_private.finalize_evidence_upload("
  );

  expect(mobileFinalize).toContain(
   "'MOBILE'"
  );
 });

 it("keeps existing WEB action functions present",()=>{
  expect(actions).toContain(
   "export async function claimOccurrence("
  );
  expect(actions).toContain(
   "export async function startOccurrence("
  );
  expect(actions).toContain(
   "export async function completeOccurrenceTask("
  );
  expect(actions).toContain(
   "export async function createEvidenceUploadIntent("
  );
 });
});
