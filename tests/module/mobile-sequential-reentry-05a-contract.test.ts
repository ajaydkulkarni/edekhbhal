import {
 readFileSync,
} from "node:fs";
import {
 describe,
 expect,
 it,
} from "vitest";

const page=readFileSync(
 "src/app/workspace/my-work/[occurrenceId]/page.tsx",
 "utf8"
);

describe(
 "Mobile Field Execution 05A refresh/re-entry and sequential execution",
 ()=>{
  it(
   "derives the authoritative current Task independently from the viewed Task",
   ()=>{
    expect(page).toContain(
     "const currentTask="
    );

    expect(page).toContain(
     'task=>task.status==="IN_PROGRESS"'
    );

    expect(page).toContain(
     "const selectedTask="
    );

    expect(page).toContain(
     "const selectedIsCurrent="
    );

    expect(page).toContain(
     "currentTask.id===selectedTask.id"
    );
   }
  );

  it(
   "defaults refresh/re-entry to the IN_PROGRESS Task before future PENDING Tasks",
   ()=>{
    expect(page).toContain(
     "const activeTask="
    );

    expect(page).toContain(
     "currentTask"
    );

    expect(page).toContain(
     'task=>task.status==="PENDING"'
    );
   }
  );

  it(
   "falls invalid task query selection back to the actual active Task",
   ()=>{
    expect(page).toContain(
     "Number.isInteger(requestedSequence)"
    );

    expect(page).toContain(
     "task=>task.sequence===requestedSequence"
    );

    expect(page).toContain(
     "??activeTask"
    );
   }
  );

  it(
   "keeps Task completion attached only to the authoritative current Task",
   ()=>{
    expect(page).toContain(
     "const canComplete="
    );

    expect(page).toContain(
     "selectedIsCurrent"
    );

    expect(page).toContain(
     'action={completeOccurrenceTaskMobile}'
    );
   }
  );

  it(
   "keeps Evidence capture attached only to the authoritative current Task",
   ()=>{
    expect(page).toContain(
     "{selectedIsCurrent"
    );

    expect(page).toContain(
     "MobileEvidenceCapture"
    );

    expect(page).toContain(
     "taskId={selectedTask.id}"
    );
   }
  );

  it(
   "allows Previous and Next browsing without changing Task state",
   ()=>{
    const nav=page.slice(
     page.indexOf(
      '<nav'
     ),
     page.indexOf(
      '</nav>'
     )
    );

    expect(nav).toContain(
     "← Previous"
    );

    expect(nav).toContain(
     "Next →"
    );

    expect(nav).not.toContain(
     "<form"
    );

    expect(nav).not.toContain(
     "action="
    );
   }
  );

  it(
   "renders non-current Tasks explicitly as read-only views",
   ()=>{
    expect(page).toContain(
     "Read-only Task view"
    );

    expect(page).toContain(
     "Execution actions remain attached to the current"
    );

    expect(page).toContain(
     "Return to current Task →"
    );
   }
  );

  it(
   "preserves completed Task history instead of reopening it for mutation",
   ()=>{
    expect(page).toContain(
     'task.status==="COMPLETED"'
    );

    expect(page).toContain(
     'selectedTask.status==="IN_PROGRESS"'
    );

    expect(page).toContain(
     "selectedIsCurrent"
    );
   }
  );
 }
);
