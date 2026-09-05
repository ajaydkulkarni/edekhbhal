import {
 readFileSync,
} from "node:fs";
import {
 describe,
 expect,
 it,
} from "vitest";

const capture=readFileSync(
 "src/app/workspace/my-work/[occurrenceId]/mobile-evidence-capture.tsx",
 "utf8"
);

const page=readFileSync(
 "src/app/workspace/my-work/[occurrenceId]/page.tsx",
 "utf8"
);

describe(
 "Mobile Field Execution 05A Evidence capture",
 ()=>{
  it(
   "uses server-selected MOBILE Evidence commands",
   ()=>{
    expect(capture).toContain(
     "createMobileEvidenceUploadIntent"
    );

    expect(capture).toContain(
     "finalizeMobileEvidenceUpload"
    );

    expect(capture).not.toContain(
     "createEvidenceUploadIntent("
    );

    expect(capture).not.toContain(
     "finalizeEvidenceUpload("
    );
   }
  );

  it(
   "preserves certified private direct Storage upload semantics",
   ()=>{
    expect(capture).toContain(
     ".from(intent.storageBucket)"
    );

    expect(capture).toContain(
     ".upload("
    );

    expect(capture).toContain(
     "intent.objectKey"
    );

    expect(capture).toContain(
     "upsert:false"
    );

    expect(capture).toContain(
     "Storage RLS"
    );
   }
  );

  it(
   "supports PHOTO and VIDEO with existing limits and content types",
   ()=>{
    expect(capture).toContain(
     "PHOTO:20*1024*1024"
    );

    expect(capture).toContain(
     "VIDEO:200*1024*1024"
    );

    expect(capture).toContain(
     '"image/jpeg,image/png,image/webp"'
    );

    expect(capture).toContain(
     '"video/mp4,video/webm,video/quicktime"'
    );
   }
  );

  it(
   "hints rear camera or camcorder capture on mobile",
   ()=>{
    expect(capture).toContain(
     'capture="environment"'
    );

    expect(capture).toContain(
     'type="file"'
    );
   }
  );

  it(
   "retains client SHA-256 finalization",
   ()=>{
    expect(capture).toContain(
     'crypto.subtle.digest('
    );

    expect(capture).toContain(
     '"SHA-256"'
    );

    expect(capture).toContain(
     "sha256Hex:checksum"
    );
   }
  );

  it(
   "refreshes focused server state after upload and on demand",
   ()=>{
    expect(capture).toContain(
     "useRouter"
    );

    expect(capture).toContain(
     "router.refresh()"
    );

    expect(capture).toContain(
     "Refresh Verification Status"
    );
   }
  );

  it(
   "does not equate upload with verification",
   ()=>{
    expect(capture).toContain(
     "Verification is pending"
    );

    expect(capture).toContain(
     "remains blocked until VERIFIED"
    );
   }
  );

  it(
   "only mounts capture for the current IN_PROGRESS Evidence-required task",
   ()=>{
    expect(page).toContain(
     'selectedTask.status==="IN_PROGRESS"'
    );

    expect(page).toContain(
     "selectedTask.evidence_required"
    );

    expect(page).toContain(
     "!verified"
    );

    expect(page).toContain(
     "MobileEvidenceCapture"
    );

    expect(page).toContain(
     "taskId={selectedTask.id}"
    );

    expect(page).toContain(
     "taskVersion={selectedTask.version}"
    );

    expect(page).toContain(
     "evidenceType={selectedTask.required_evidence_type}"
    );
   }
  );

  it(
   "keeps Task completion fail-closed behind VERIFIED Evidence",
   ()=>{
    expect(page).toContain(
     "const canComplete="
    );

    expect(page).toContain(
     "!selectedTask.evidence_required"
    );

    expect(page).toContain(
     "|| verified"
    );

    expect(page).toContain(
     "Evidence is VERIFIED by the media pipeline."
    );
   }
  );
 }
);
