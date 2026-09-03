import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "docs/VNEXT-PROJECT-CONTEXT.md";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

function mustReplace(before, after, label) {
  if (!s.includes(before)) throw new Error(`Could not find expected ${label}; refusing partial update.`);
  s = s.replace(before, after);
}

mustReplace(
`**Last updated:** 2026-09-02  
**Primary rebuild branch:** \`vNext\`  
**Latest validated vNext functional commit:** \`b99b38f\` — \`Add vNext authentication and guided onboarding foundation\`  
**Previous validated database baseline:** \`0109eb5\` — \`Establish vNext RLS database foundation\``,
`**Last updated:** 2026-09-03  
**Primary rebuild branch:** \`vNext\`  
**Latest validated vNext functional commit:** \`3c360af\` — \`Add Work Area and QR lifecycle foundation\`  
**Previous validated functional baseline:** \`b99b38f\` — \`Add vNext authentication and guided onboarding foundation\`  
**Validated database foundation:** \`0109eb5\` — \`Establish vNext RLS database foundation\``,
"header baseline"
);

mustReplace(
`Onboarding creates only the **first Site**. Normal multi-Site administration belongs to the later Site management module.

---

## 9. Billing & Entitlements Foundation`,
`Onboarding creates only the **first Site**. Normal multi-Site administration belongs to the later Site management module.

---

## 9. Work Area + QR Lifecycle Foundation

Validated functional commit:

\`3c360af Add Work Area and QR lifecycle foundation\`

Implemented hierarchy:

\`Organization → Site → Work Area\`

Work Area foundation includes:

- explicit \`organization_id\` and parent \`site_id\`
- name/code/description/location fields
- ACTIVE/INACTIVE soft lifecycle
- optimistic \`version\`
- Site-scoped authorization
- RLS + FORCE RLS
- management writes limited to ADMIN and assigned SITE_MANAGER scope
- \`site_membership_scope\` foundation for assignment-based Site access

QR lifecycle includes:

- one ACTIVE database-backed QR identity per Work Area
- partial unique database constraint enforcing one active QR
- random 48-character public token separate from internal UUIDs
- Reprint preserves the same active QR identity
- Regenerate atomically revokes the old QR and creates a new identity
- old public QR becomes invalid after regeneration
- create/regenerate idempotency records
- row locking/concurrency protection
- safe public resolver at \`/q/[token]\`
- printable 4×6 Work Area QR label
- QR never grants application authorization

The public resolver intentionally exposes only safe transparency fields:

- Organization name
- Site name
- Work Area name
- Work Area description/location
- service status

It does not expose worker contact details, private notes, audit history, memberships, or private evidence.

Migration \`0005_work_area_qr_token_hotfix.sql\` replaced the initial \`gen_random_bytes\` token implementation with two PostgreSQL UUIDv4 values truncated to 48 lowercase hex characters. The base \`0004\` migration was repaired too, so a clean replay does not reintroduce the defect.

Demo parity includes synthetic Work Area + QR lifecycle behavior and explicitly explains Reprint, Regenerate, public scanning, and the rule that QR identity is not authorization.

---

## 10. Billing & Entitlements Foundation`,
"Work Area section"
);

for (let n = 20; n >= 10; n--) {
  s = s.replace(`## ${n}. `, `## ${n + 1}. `);
}

mustReplace(
`Authentication/onboarding foundation currently audits:

- \`ORGANIZATION_CREATED\`
- \`FREE_PLAN_ACTIVATED\`
- \`SITE_CREATED\`

All future meaningful changes require change-of-value testing where applicable.`,
`Current validated audit coverage includes:

- \`ORGANIZATION_CREATED\`
- \`FREE_PLAN_ACTIVATED\`
- \`SITE_CREATED\`
- \`WORK_AREA_CREATED\`
- \`QR_ISSUED\`
- \`QR_REGENERATED\`
- \`WORK_AREA_STATUS_CHANGED\`

All future meaningful changes require change-of-value testing where applicable.`,
"audit coverage"
);

mustReplace(
`Current Demo onboarding illustrates:

- User details
- Organization creation
- plan selection
- first Site
- workspace handoff

It explicitly explains that real authentication, billing writes, evidence capture, and destructive actions are unavailable in Demo.`,
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

It explicitly explains that real authentication, tenant writes, QR regeneration, billing writes, evidence capture, and destructive actions are unavailable in Demo.`,
"Demo coverage"
);

const baselineStart = s.indexOf("## 18. Current Validated Test Baseline");
const baselineEnd = s.indexOf("---\n\n## 19. Current Technology Baseline");
if (baselineStart < 0 || baselineEnd < 0 || baselineEnd <= baselineStart) {
  throw new Error("Could not locate validated test baseline section.");
}

const baseline = `## 18. Current Validated Test Baseline

At commit \`3c360af\`, the validated development run was:

### Integration

- Database Foundation RLS tests: **13/13 PASS**
- Auth + Onboarding integration tests: **6/6 PASS**
- Work Area + QR integration tests: **7/7 PASS**
- Total integration: **26/26 PASS**

### Full Vitest

- Test files: **8/8 PASS**
- Tests: **37/37 PASS**

Includes Work Area + QR lifecycle, RLS, onboarding, tenant-context, audit-diff, state-machine, foundation-contract, and route-state coverage.

### Build gates

- TypeScript: **PASS**
- ESLint: **PASS**
- Next.js production build: **PASS**

Additional validated routes:

- \`/q/[token]\`
- \`/workspace/work-areas\`
- \`/workspace/work-areas/[id]/qr\`

### Playwright

- Public Auth + Demo onboarding paths: PASS
- Landing primary product paths: PASS
- Demo Work Area + QR lifecycle: PASS
- Total: **3/3 PASS**

`;

s = s.slice(0, baselineStart) + baseline + s.slice(baselineEnd);

const targetStart = s.indexOf("## 20. Immediate Next Development Target");
const targetEnd = s.indexOf("---\n\n## 21. Important Deferred Items");
if (targetStart < 0 || targetEnd < 0 || targetEnd <= targetStart) {
  throw new Error("Could not locate immediate next target section.");
}

const target = `## 20. Immediate Next Development Target

Next functional increment:

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

Do not implement Schedule/Occurrence execution in the Task increment. Task remains a reusable Organization-level master and must not be coupled to a specific Site or Work Area.

`;

s = s.slice(0, targetStart) + target + s.slice(targetEnd);

mustReplace(
`- multi-Site administration UI
- Work Areas
- QR lifecycle
- Tasks`,
`- multi-Site administration UI
- Tasks`,
"deferred items"
);

mustReplace(
`Key validated vNext commits:

- \`0109eb5\` — Establish vNext RLS database foundation
- \`b99b38f\` — Add vNext authentication and guided onboarding foundation

\`b99b38f\` is the current functional baseline for subsequent vNext development.`,
`Key validated vNext commits:

- \`0109eb5\` — Establish vNext RLS database foundation
- \`b99b38f\` — Add vNext authentication and guided onboarding foundation
- \`3c360af\` — Add Work Area and QR lifecycle foundation

\`3c360af\` is the current locked functional baseline for subsequent vNext development.`,
"baseline commit chain"
);

fs.writeFileSync(file, s, "utf8");
console.log("Updated docs/VNEXT-PROJECT-CONTEXT.md for validated commit 3c360af.");
