import fs from "node:fs";

const path = "PROJECT-CONTEXT.md";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(label, oldText, newText) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`[${label}] expected source text not found. PROJECT-CONTEXT.md may have changed.`);
  const second = text.indexOf(oldText, first + oldText.length);
  if (second >= 0) throw new Error(`[${label}] source text occurs more than once; refusing ambiguous update.`);
  text = text.slice(0, first) + newText + text.slice(first + oldText.length);
}

replaceOnce(
  "header baseline",
  `**Last updated:** 2026-09-01  
**Current application version:** v0.9.1 base with eDekhbhal Next previews / fine-tuning / Demo Workspace increments  
**Primary development branch:** \`v2-rebuild\`  
**V2 Web URL:** \`https://edekhbhal.vercel.app\`  
**Latest validated V2 commit used by E2E:** \`fe1ea082d8e2f2c71bc5a695d9b8b063134f71ac\`  
**Current verified Web/API E2E baseline:** **44/44 PASS**  
**Demo Workspace focused E2E:** **8/8 PASS**  
**RLS status:** runtime context foundation is implemented and tested, but **RLS is NOT enabled on business tables**.`,
  `**Last updated:** 2026-09-02  
**Current application version:** v0.9.1 base with eDekhbhal Next previews / fine-tuning / Demo Workspace / Combined Build 02 increments  
**Primary development branch:** \`v2-rebuild\`  
**V2 Web URL:** \`https://edekhbhal.vercel.app\`  
**Latest validated V2 commit used by E2E:** \`de512d750c741337bba639daad586a81a055fb85\`  
**Current verified Web/API E2E baseline:** **46/46 PASS**  
**Demo Workspace focused E2E:** **10/10 PASS**  
**RLS status:** runtime context foundation is implemented and tested, but **RLS is NOT enabled on business tables**.`
);

replaceOnce(
  "qr printing",
  `Schedule detail displays the latest ACTIVE QR for its Work Area.

---`,
  `Schedule detail displays the latest ACTIVE QR for its Work Area.

### 4×6 Work Area QR label

The validated Web implementation supports browser printing to a Zebra-compatible 4×6 portrait label through the installed printer driver.

The label presentation is:

1. product name — currently **eDekhbhal**;
2. Organization name;
3. Property name;
4. Work Area name;
5. large centered QR;
6. **Scan for Service Information**.

The printed label intentionally does **not** display the QR database ID.

The product name and scan prompt are centralized in \`src/lib/productBrand.ts\` so branding can be changed later without redesigning the label.

The current QR URL identity remains the active random database \`QrCode.id\`. Reprint keeps the same active identity; Regenerate revokes the old QR and creates a new identity. Hiding an ID in printed text is not treated as copy protection because any physical QR image can still be photographed or photocopied. A broader bearer-token/public-identity migration, if desired, is a separate future security-hardening change and must include mobile/public-QR compatibility.

---`
);

replaceOnce(
  "schedule document control",
  `The Schedule must fit completely inside an effective open working-hours window to be generated.

---`,
  `The Schedule must fit completely inside an effective open working-hours window to be generated.

### Controlled-document / QMS reference

Schedules also support optional controlled-document metadata:

- **Document / SOP Reference No.** — e.g. \`QMS-PRD-017\`, \`SOP-HK-004\`;
- **Revision / Version** — e.g. \`Rev 03\`, \`v2.1\`.

These fields support ISO/QMS-style checklist/document traceability but must not be described as proving ISO certification compliance by themselves.

When occurrences are generated, the Schedule values are snapshotted so later Schedule edits do not rewrite historical reporting:

\`Schedule.documentReference → ScheduleOccurrence.documentReferenceSnapshot\`

\`Schedule.documentRevision → ScheduleOccurrence.documentRevisionSnapshot\`

---`
);

replaceOnce(
  "occurrence snapshots",
  `- Property/Work Area/Schedule snapshots;
- planned duration;`,
  `- Property/Work Area/Schedule snapshots;
- Document / SOP Reference and Revision snapshots;
- planned duration;`
);

replaceOnce(
  "dashboard refresh",
  `Dashboard access and queries must remain Organization/Property scoped.

---`,
  `Dashboard access and queries must remain Organization/Property scoped.

The Action Queue refresh behavior is hardened for navigation resume: when a manager creates a Schedule from a Reported Work item and returns to the Dashboard, the live dashboard refreshes on page resume/focus/visibility changes so the stale **Create Schedule** action is removed promptly. The existing backend duplicate-link guard remains authoritative.

---`
);

replaceOnce(
  "report controlled document",
  `Supports filtering, sorting, CSV and XLSX export.`,
  `Supports filtering, sorting, CSV and XLSX export.

Service Log and relevant occurrence/compliance detail surfaces include the occurrence's snapshotted **Document / SOP Reference** and **Revision / Version**, and exports carry the same historical values.`
);

replaceOnce(
  "demo behavior additions",
  `- Demo remains read-only and separate from tenant database records.`,
  `- Demo remains read-only and separate from tenant database records;
- Demo Schedule examples include controlled-document/SOP references and revisions;
- Demo reporting surfaces show representative controlled-document values;
- Demo Work Areas expose the same 4×6 label concept using fake Demo QR identities only;
- Demo Dashboard evidence uses publicly available real-world reference photos where appropriate, clearly presented as sample/reference evidence rather than actual eDekhbhal field captures.`
);

replaceOnce(
  "demo section heading",
  `## 23. Demo Workspace Batches 01 & 02 — VERIFIED GREEN`,
  `## 23. Demo Workspace Batches 01–03 — VERIFIED GREEN`
);

replaceOnce(
  "demo intro",
  `Demo Workspace Batch 02 changed the Demo from a summary/brochure-style experience into a much closer read-only representation of the real Organization Workspace.`,
  `Demo Workspace Batch 02 changed the Demo from a summary/brochure-style experience into a much closer read-only representation of the real Organization Workspace.

Demo Workspace Batch 03 completed Dashboard & Navigation parity enhancements, including deterministic workforce states, evidence presentation, activity feed, Attention Required, Schedule Progress, controlled submenu behavior, and synthetic Administration equivalents. It was validated before Combined Build 02 and is part of the current green baseline.`
);

const oldBaseline = `## 30. Verified V2 Regression Baseline — 2026-09-01

GitHub Actions run:

\`33474724798\`

Branch:

\`v2-rebuild\`

Commit:

\`fe1ea082d8e2f2c71bc5a695d9b8b063134f71ac\`

Verified:

- Prisma Client generation — PASS
- TypeScript check — PASS
- Demo Workspace focused suite — **8/8 PASS**
- Complete V2 suite — **44/44 PASS**
- Playwright artifact upload — PASS

The focused Demo suite validates:

- switching into the universal Demo Workspace;
- deterministic Demo Reports;
- detailed Demo Task definition and safe Task-template prefill;
- detailed Demo Schedule definition with ordered Tasks;
- Property detail tabs;
- Work Area Service Status and Demo QR;
- unauthenticated public Demo QR;
- server-rendered role-simulator perspective changes.

The complete 44-test suite covers the active baseline including:

- Audit;
- cross-tenant isolation;
- Demo Workspace UI/drill-down parity;
- fine-tuning UI;
- mobile queue authorization;
- V2 public landing;
- Schedule Work Area QR;
- public QR privacy;
- property access;
- reported work;
- RLS transaction-context foundation;
- key smoke/profile flows.

This **44/44** result is the current canonical regression baseline.`;

const newBaseline = `## 30. Verified V2 Regression Baseline — 2026-09-02

GitHub Actions run:

\`33656347076\`

Job:

\`100335772267\`

Branch:

\`v2-rebuild\`

Commit:

\`de512d750c741337bba639daad586a81a055fb85\`

Commit message:

\`edekhbhal-combined-build-02\`

Verified:

- Prisma Client generation — PASS on Prisma **6.19.3**
- TypeScript check — PASS
- local production build — PASS, **58/58** static pages generated
- Demo Workspace focused suite — **10/10 PASS**
- Complete V2 suite — **46/46 PASS**
- Playwright artifact upload — PASS

Playwright artifact:

- name: \`playwright-report-v2\`
- artifact ID: \`9857093840\`
- size: \`259101\` bytes
- SHA256: \`a6ff6b57a830d5b776e501447113119a0fd3d95629b8ba7a68e05b813bd12919\`
- retention through 2026-09-16

The focused Demo suite validates the universal Demo Workspace, Dashboard/navigation behavior, Reports, Task template bridge, Schedule detail, Property detail, Work Area service status, public Demo QR and server-rendered role perspectives.

The complete 46-test suite covers the active baseline including:

- Audit;
- cross-tenant isolation;
- Demo Workspace UI/drill-down parity;
- fine-tuning UI;
- mobile queue authorization;
- V2 public landing;
- Schedule Work Area QR;
- public QR privacy;
- property access;
- reported work;
- RLS transaction-context foundation;
- key smoke/profile flows.

Combined Build 02 additionally introduced and compile/build validated:

- Action Queue resume refresh after Reported Work → Schedule creation;
- Schedule controlled-document/SOP reference and revision fields;
- occurrence-level document-reference/revision historical snapshots;
- controlled-document values in reporting/export surfaces;
- 4×6 Work Area QR label presentation with no visible QR ID;
- Demo equivalents for document control and QR-label presentation;
- real-world public reference images in Demo evidence presentation.

No separate four-test Combined Build E2E spec was added in Build 02; therefore the canonical full-suite count remains **46/46**, not 50.

This **46/46** result is the current canonical regression baseline.`;

replaceOnce("verified baseline section", oldBaseline, newBaseline);

const old33A = `## 33A. Demo Workspace Batch 03 — DASHBOARD & NAVIGATION PARITY (PENDING VALIDATION)

Batch 03 is the current in-progress increment. Do not call it green until the V2 E2E workflow passes after deployment.

Scope:

- Demo Dashboard uses the same visual/section hierarchy and CSS class concepts as the real \`LiveOperationsDashboard\`.
- Demo adds deterministic synthetic workforce with Working, Online/Idle, Working-without-heartbeat and Offline states.
- Demo shows online-vs-total users and the same workforce columns used by the real Dashboard.
- Demo adds a Recent Evidence carousel with bundled sample evidence images, previous/next controls, expansion thumbnails and evidence modal.
- Demo adds Task-completion Activity Feed.
- Demo adds Attention Required in the real dashboard style.
- Demo adds Schedule Progress with Completed / In Progress / Upcoming / Overdue / Missed / Partial breakdown.
- Demo dropdown menus are controlled client components and close on submenu navigation, outside click and Escape.
- Demo Administration navigation gains synthetic Audit Trail and Subscription equivalents for closer menu parity.
- Demo remains read-only/synthetic and performs no database writes.
- RLS remains disabled.

Pre-Batch-03 verified baseline remains:

- Demo focused: **8/8 PASS**
- Full V2: **44/44 PASS**
- validated commit: \`fe1ea082d8e2f2c71bc5a695d9b8b063134f71ac\`

Expected test count after the two new Batch 03 E2E assertions is approximately **46** total, but the exact new baseline must be recorded only after GitHub Actions verifies it.`;

const new33A = `## 33A. Recent Verified Increments — Demo Batch 03 + Combined Build 02

### Demo Workspace Batch 03 — VERIFIED

Implemented and validated before Combined Build 02:

- Demo Dashboard uses the real Dashboard's visual/section hierarchy and CSS concepts;
- deterministic synthetic workforce includes Working, Online/Idle, Working-without-heartbeat and Offline;
- online-vs-total users and real-style workforce columns;
- Recent Evidence carousel with navigation, expansion thumbnails and modal;
- Task-completion Activity Feed;
- Attention Required;
- Schedule Progress with Completed / In Progress / Upcoming / Overdue / Missed / Partial;
- controlled Demo dropdown behavior;
- synthetic Audit Trail and Subscription Administration equivalents;
- read-only/synthetic behavior with no tenant database writes.

Batch 03 raised the verified baseline to Demo **10/10** and full V2 **46/46**.

### Combined Build 02 — VERIFIED

Validated commit:

\`de512d750c741337bba639daad586a81a055fb85\`

Scope:

- Action Queue stale Create Schedule refresh fix;
- Schedule Document / SOP Reference No. and Revision / Version;
- occurrence snapshot preservation of those controlled-document values;
- report and export visibility of the snapshots;
- Zebra-compatible browser printing on 4×6 portrait labels;
- label hierarchy: eDekhbhal → Organization → Property → Work Area → QR → Scan for Service Information;
- no visible QR database ID on the printed label;
- Demo controlled-document examples;
- Demo fake 4×6 QR-label equivalent;
- publicly available real-world reference photos in Demo evidence presentation.

RLS remains disabled.`;

replaceOnce("33A verified increments", old33A, new33A);

replaceOnce(
  "next steps status",
  `Batch 02 is complete and green. Batch 03 Dashboard & Navigation Parity is currently pending validation.`,
  `Batches 01–03 and Combined Build 02 are complete and green.`
);

replaceOnce(
  "resume counts",
  `- current E2E baseline is **44/44**;
- Demo focused baseline is **8/8**;`,
  `- current E2E baseline is **46/46** at commit \`de512d750c741337bba639daad586a81a055fb85\`;
- Demo focused baseline is **10/10**;`
);

fs.writeFileSync(path, text, "utf8");
console.log("PROJECT-CONTEXT.md updated to the 2026-09-02 Combined Build 02 verified baseline.");
