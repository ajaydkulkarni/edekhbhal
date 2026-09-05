import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const page=readFileSync(
 "src/app/workspace/my-work/[occurrenceId]/page.tsx",
 "utf8"
);

const queue=readFileSync(
 "src/app/workspace/my-work/page.tsx",
 "utf8"
);

const css=readFileSync(
 "src/app/globals.css",
 "utf8"
);

describe("Mobile Field Execution Foundation 05A focused route",()=>{
 it("uses the exact tenant-scoped focused reader",()=>{
  expect(page).toContain(
   "getMyWorkOccurrence("
  );

  expect(page).toContain(
   "listOccurrenceTasks("
  );

  expect(page).toContain(
   "listOccurrenceEvidence("
  );
 });

 it("uses MOBILE command boundaries and delegates QR start to the scanner",()=>{
  expect(page).toContain(
   "claimOccurrenceMobile"
  );

  expect(page).toContain(
   "completeOccurrenceTaskMobile"
  );

  expect(page).toContain(
   "partiallyCompleteOccurrenceMobile"
  );

  expect(page).toContain(
   "QrStartScanner"
  );

  expect(page).not.toContain(
   "startOccurrenceMobile"
  );
 });

 it("implements Previous and Next as read-only Links",()=>{
  expect(page).toContain(
   'aria-label="Task navigation"'
  );

  expect(page).toContain(
   "← Previous"
  );

  expect(page).toContain(
   "Next →"
  );

  expect(page).toContain(
   "`/workspace/my-work/${occurrence.id}`"
  );

  expect(page).toContain(
   "+`?task=${previousTask.sequence}`"
  );

  expect(page).toContain(
   "+`?task=${nextTask.sequence}`"
  );
 });

 it("does not attach mutation actions to navigation controls",()=>{
  const nav=page.slice(
   page.indexOf(
    '<nav'
   ),
   page.indexOf(
    '</nav>'
   )
  );

  expect(nav).not.toContain(
   "action="
  );

  expect(nav).not.toContain(
   "<form"
  );
 });

 it("keeps evidence-required completion fail-closed",()=>{
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
   "Task completion remains blocked until"
  );
 });

 it("links the existing My Work queue into the focused route",()=>{
  expect(queue).toContain(
   "Open focused mobile view →"
  );

  expect(queue).toContain(
   "href={`/workspace/my-work/${item.id}`}"
  );
 });

 it("adds a dedicated responsive mobile execution surface",()=>{
  expect(css).toContain(
   "/* Mobile Field Execution Foundation 05A */"
  );

  expect(css).toContain(
   ".mobileTaskNavigator"
  );

  expect(css).toContain(
   "@media(max-width:620px)"
  );
 });
});
