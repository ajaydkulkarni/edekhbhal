import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "docs/VNEXT-PROJECT-CONTEXT.md";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

for (const marker of [
  "**Latest validated vNext baseline:** `41af015`",
  "## 10. Billing & Entitlements Foundation",
  "## 18. Current Validated Test Baseline",
  "**Task Master Foundation 01**",
  "- Tasks",
  "`41af015` is the current locked vNext baseline",
]) {
  if (!s.includes(marker)) throw new Error(`Required continuity anchor missing: ${marker}`);
}

s = s.replace(
  "**Latest validated vNext baseline:** `41af015` — `Harden Work Area QR authorization and idempotency`",
  "**Latest validated vNext baseline:** `a6e8072` — `Add Task Master foundation`\n**Task Master functional baseline:** `a6e8072` — `Add Task Master foundation`"
);

const taskSection = `## 10. Task Master Foundation

Validated functional commit:

\`a6e8072 Add Task Master foundation\`

Tasks are reusable Organization-level masters and are deliberately not coupled to a Site or Work Area.

Implemented Task foundation includes:

- explicit \`organization_id\`
- name and rich HTML instruction source
- ACTIVE/INACTIVE soft lifecycle
- optimistic \`version\`
- RLS + FORCE RLS
- ADMIN management
- permitted SITE_MANAGER management when the membership has Site scope in the Organization
- USER read-only visibility
- idempotent Task creation
- audited create/edit/status changes with old/new values
- attachment metadata contract for private object storage
- no Base64 media storage in PostgreSQL
- workspace administration route at \`/workspace/tasks\`
- Workspace Task metric/navigation
- synthetic Demo Task parity
- service/query contracts suitable for later Schedule composition

Task attachment metadata currently records storage provider/bucket/key, original filename, media type, byte size, and optional SHA-256 checksum. Actual upload/signing/media-processing infrastructure remains deferred.

The management UI stores rich HTML source but renders a text-safe preview rather than executing stored markup on the Task list page.

Task Master database commands use transaction-local tenant context and preserve the existing vNext runtime/migrator separation.

Validated Task audit actions include:

- \`TASK_CREATED\`
- \`TASK_UPDATED\`
- \`TASK_STATUS_CHANGED\`

Task Master Foundation does not implement Schedule or Occurrence execution.

---

`;

s = s.replace("## 10. Billing & Entitlements Foundation", taskSection + "## 11. Billing & Entitlements Foundation");

const renumber = [
  ["## 11. Audit", "## 12. Audit"],
  ["## 12. Transactional Outbox", "## 13. Transactional Outbox"],
  ["## 13. Demo Workspace Rule", "## 14. Demo Workspace Rule"],
  ["## 14. Time Rules", "## 15. Time Rules"],
  ["## 15. Mobile & Work Execution Rules", "## 16. Mobile & Work Execution Rules"],
  ["## 16. Evidence & Storage Rules", "## 17. Evidence & Storage Rules"],
  ["## 17. Platform Control Plane", "## 18. Platform Control Plane"],
  ["## 18. Current Validated Test Baseline", "## 19. Current Validated Test Baseline"],
  ["## 19. Current Technology Baseline", "## 20. Current Technology Baseline"],
  ["## 20. Immediate Next Development Target", "## 21. Immediate Next Development Target"],
  ["## 21. Important Deferred Items", "## 22. Important Deferred Items"],
  ["## 22. Baseline Commit Chain", "## 23. Baseline Commit Chain"],
];
for (const [from, to] of renumber) {
  if (!s.includes(from)) throw new Error(`Numbering anchor missing: ${from}`);
  s = s.replace(from, to);
}

s = s.replace(
`Current Demo illustrates:

- User details
- Organization creation
- plan selection
- first Site
- workspace handoff
- synthetic Work Area lifecycle
- QR Reprint vs Regenerate behavior
- safe public QR transparency
- the rule that QR identity never grants authorization`,
`Current Demo illustrates:

- User details
- Organization creation
- plan selection
- first Site
- workspace handoff
- synthetic Work Area lifecycle
- QR Reprint vs Regenerate behavior
- safe public QR transparency
- the rule that QR identity never grants authorization
- representative reusable Task masters
- ACTIVE/INACTIVE Task lifecycle
- management-role vs USER read-only Task behavior
- private object-storage attachment contract without Base64 media`
);

s = s.replace(
  "It explicitly explains that real authentication, tenant writes, QR regeneration, billing writes, evidence capture, and destructive actions are unavailable in Demo.",
  "It explicitly explains that real authentication, tenant writes, Task changes, QR regeneration, billing writes, evidence capture, and destructive actions are unavailable in Demo."
);

const oldTests = `At commit \`41af015\`, the validated development run was:

### Integration

- Database Foundation RLS tests: **13/13 PASS**
- Auth + Onboarding integration tests: **6/6 PASS**
- Work Area + QR foundation integration tests: **7/7 PASS**
- Work Area + QR Hardening 02 integration tests: **6/6 PASS**
- Total integration: **32/32 PASS**

Hardening 02 specifically verifies:

- Site visibility scoping for ADMIN, SITE_MANAGER, and USER
- historical visibility under an INACTIVE assigned Site
- blocking new Work Areas under an INACTIVE Site
- USER denial from command idempotency payloads
- same-key concurrent Work Area creation
- same-key concurrent QR regeneration

### Full Vitest

- Test files: **10/10 PASS**
- Tests: **46/46 PASS**`;

const newTests = `At commit \`a6e8072\`, the validated development run was:

### Integration

- Database Foundation RLS tests: **13/13 PASS**
- Auth + Onboarding integration tests: **6/6 PASS**
- Work Area + QR foundation integration tests: **7/7 PASS**
- Work Area + QR Hardening 02 integration tests: **6/6 PASS**
- Task Master Foundation integration tests: **8/8 PASS**
- Total integration: **40/40 PASS**

Task Master Foundation specifically verifies:

- deterministic ADMIN, scoped SITE_MANAGER, USER, and Site fixture
- idempotent reusable Task creation
- rich HTML instruction-source persistence
- scoped SITE_MANAGER management
- USER read-only behavior through RLS
- optimistic versioning and stale-update rejection
- audited old/new values for Task edits
- ACTIVE/INACTIVE soft lifecycle
- Task lifecycle audit old/new values
- attachment metadata contract without Base64/blob content columns
- fail-closed reads without tenant context
- Task create/edit/status audit action coverage

### Full Vitest

- Test files: **12/12 PASS**
- Tests: **57/57 PASS**`;

if (!s.includes(oldTests)) throw new Error("Validated test baseline anchor did not match.");
s = s.replace(oldTests, newTests);

s = s.replace(
  "- `/workspace`\n- `/q/[token]`",
  "- `/workspace`\n- `/workspace/tasks`\n- `/q/[token]`"
);

s = s.replace(
  "- Demo Work Area + QR lifecycle: PASS\n- Total: **3/3 PASS**",
  "- Demo Work Area + QR + Task Master lifecycle: PASS\n- Total: **3/3 PASS**"
);

const oldTarget = `Next functional increment:

**Task Master Foundation 01**

The increment should establish:

1. Organization-level reusable Task master
2. name and rich task instructions/description
3. ACTIVE/INACTIVE lifecycle
4. ADMIN and permitted SITE_MANAGER management; USER read-only
5. attachment metadata contract prepared for private object storage
6. no Base64 media storage
7. audit old/new values for create/edit/status changes
8. RLS + FORCE RLS
9. optimistic versioning
10. idempotent command boundaries where applicable
11. Demo parity with representative synthetic Tasks
12. deterministic seed/test data
13. unit/module/integration/RLS/change-of-value coverage
14. workspace Task administration UI
15. API/service contracts suitable for later Schedule composition

Do not implement Schedule/Occurrence execution in the Task increment. Task remains a reusable Organization-level master and must not be coupled to a specific Site or Work Area.`;

const newTarget = `Next functional increment:

**Schedule Master Foundation 01**

The increment should establish the reusable planning layer that binds one Work Area to one or more Tasks while preserving local scheduling intent and future Occurrence snapshots.

Before implementation, re-read the legacy Schedule behavior and current vNext time/security rules. The Schedule increment must define recurring and one-time schedule masters, ordered Task associations, planned duration/sequence, evidence-rule contracts, timezone/local-time intent, ACTIVE/INACTIVE lifecycle, RLS/role/site-scope authorization, audit/change-of-value coverage, optimistic versioning/idempotency where applicable, Demo parity, and service contracts suitable for later Occurrence generation.

Do not implement mobile execution in the Schedule Master increment. Occurrence generation/execution remains a separate subsequent increment.`;

if (!s.includes(oldTarget)) throw new Error("Immediate-next-target anchor did not match.");
s = s.replace(oldTarget, newTarget);

s = s.replace("\n- Tasks\n- Schedules", "\n- Schedules");

s = s.replace(
  "- `41af015` — Harden Work Area QR authorization and idempotency",
  "- `41af015` — Harden Work Area QR authorization and idempotency\n- `a6e8072` — Add Task Master foundation"
);

s = s.replace(
  "`41af015` is the current locked vNext baseline for subsequent development. Task Master Foundation 01 remains the immediate next functional increment.",
  "`a6e8072` is the current locked vNext functional baseline for subsequent development. Schedule Master Foundation 01 is the immediate next functional increment."
);

const auditAnchor = "- `WORK_AREA_STATUS_CHANGED`";
s = s.replace(
  auditAnchor,
  auditAnchor + "\n- `TASK_CREATED`\n- `TASK_UPDATED`\n- `TASK_STATUS_CHANGED`"
);

const requiredFinal = [
  "**Latest validated vNext baseline:** `a6e8072`",
  "## 10. Task Master Foundation",
  "Task Master Foundation integration tests: **8/8 PASS**",
  "Total integration: **40/40 PASS**",
  "Test files: **12/12 PASS**",
  "Tests: **57/57 PASS**",
  "- `/workspace/tasks`",
  "**Schedule Master Foundation 01**",
  "- `a6e8072` — Add Task Master foundation",
  "`a6e8072` is the current locked vNext functional baseline",
  "## 23. Baseline Commit Chain",
];
for (const marker of requiredFinal) {
  if (!s.includes(marker)) throw new Error(`Final continuity marker missing: ${marker}`);
}

s = s.split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n");
if (!s.endsWith("\n")) s += "\n";

fs.writeFileSync(file, s, "utf8");
execSync("git --no-pager diff --check -- docs/VNEXT-PROJECT-CONTEXT.md", { stdio: "inherit" });

console.log("vNext continuity updated for Task Master Foundation 01; diff check passed.");
