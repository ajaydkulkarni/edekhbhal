import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "docs/VNEXT-PROJECT-CONTEXT.md";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

function mustReplace(before, after, label) {
  if (!s.includes(before)) {
    if (s.includes(after)) {
      console.log(`${label} already updated.`);
      return;
    }
    throw new Error(`Could not locate expected ${label}; refusing partial update.`);
  }
  s = s.replace(before, after);
}

mustReplace(
`**Last updated:** 2026-09-03  
**Primary rebuild branch:** \`vNext\`  
**Latest validated vNext functional commit:** \`3c360af\` — \`Add Work Area and QR lifecycle foundation\`  
**Previous validated functional baseline:** \`b99b38f\` — \`Add vNext authentication and guided onboarding foundation\`  
**Validated database foundation:** \`0109eb5\` — \`Establish vNext RLS database foundation\``,
`**Last updated:** 2026-09-03  
**Primary rebuild branch:** \`vNext\`  
**Latest validated vNext baseline:** \`41af015\` — \`Harden Work Area QR authorization and idempotency\`  
**Work Area + QR functional baseline:** \`3c360af\` — \`Add Work Area and QR lifecycle foundation\`  
**Previous validated functional baseline:** \`b99b38f\` — \`Add vNext authentication and guided onboarding foundation\`  
**Validated database foundation:** \`0109eb5\` — \`Establish vNext RLS database foundation\``,
"header baseline"
);

mustReplace(
`Current Site policies allow tenant-scoped visibility and controlled ADMIN/SITE_MANAGER writes when a valid tenant context exists.

Onboarding creates only the **first Site**. Normal multi-Site administration belongs to the later Site management module.`,
`Current Site authorization is assignment-aware:

- ADMIN retains Organization-wide Site visibility.
- SITE_MANAGER sees only explicitly assigned Sites.
- USER sees only explicitly assigned Sites.
- Site scope is independent of Site ACTIVE/INACTIVE state for historical visibility.
- creation of new Work Areas and QR regeneration require an ACTIVE Site.
- normal multi-Site administration UI remains deferred.

Onboarding creates only the **first Site**. Normal multi-Site administration belongs to the later Site management module.`,
"Site authorization summary"
);

mustReplace(
`Demo parity includes synthetic Work Area + QR lifecycle behavior and explicitly explains Reprint, Regenerate, public scanning, and the rule that QR identity is not authorization.

---`,
`Demo parity includes synthetic Work Area + QR lifecycle behavior and explicitly explains Reprint, Regenerate, public scanning, and the rule that QR identity is not authorization.

### Work Area + QR Hardening 02

Validated hardening commit:

\`41af015 Harden Work Area QR authorization and idempotency\`

Hardening 02 established:

- assignment-scoped Site visibility for SITE_MANAGER and USER
- Organization-wide Site visibility retained for ADMIN
- historical Site and Work Area reads preserved when an assigned Site becomes INACTIVE
- new Work Area creation blocked when the parent Site is INACTIVE
- QR regeneration blocked when the parent Site is INACTIVE
- USER cannot read command idempotency payloads
- same-key Work Area creation is serialized with transaction-scoped advisory locking
- same-key QR regeneration is serialized with transaction-scoped advisory locking
- concurrent callers using the same idempotency key receive the same operation result
- existing one-active-QR and RLS invariants remain enforced

The hardening migration is \`0006_work_area_qr_hardening.sql\`.

---`,
"Work Area hardening subsection"
);

const baselineStart = s.indexOf("## 18. Current Validated Test Baseline");
const baselineEnd = s.indexOf("---\n\n## 19. Current Technology Baseline");
if (baselineStart < 0 || baselineEnd < 0 || baselineEnd <= baselineStart) {
  throw new Error("Could not locate validated test baseline section.");
}

const baseline = `## 18. Current Validated Test Baseline

At commit \`41af015\`, the validated development run was:

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
- Tests: **46/46 PASS**

### Build gates

- TypeScript: **PASS**
- ESLint: **PASS**
- Next.js production build: **PASS**

Validated routes include:

- \`/\`
- \`/demo\`
- \`/login\`
- \`/register\`
- \`/auth/callback\`
- \`/onboarding/profile\`
- \`/onboarding/organization\`
- \`/onboarding/plan\`
- \`/onboarding/site\`
- \`/workspace\`
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

mustReplace(
`Key validated vNext commits:

- \`0109eb5\` — Establish vNext RLS database foundation
- \`b99b38f\` — Add vNext authentication and guided onboarding foundation
- \`3c360af\` — Add Work Area and QR lifecycle foundation

\`3c360af\` is the current locked functional baseline for subsequent vNext development.`,
`Key validated vNext commits:

- \`0109eb5\` — Establish vNext RLS database foundation
- \`b99b38f\` — Add vNext authentication and guided onboarding foundation
- \`3c360af\` — Add Work Area and QR lifecycle foundation
- \`de64847\` — Harden Work Area QR foundation
- \`59477e1\` — Fix vNext context section numbering
- \`41af015\` — Harden Work Area QR authorization and idempotency

\`41af015\` is the current locked vNext baseline for subsequent development. Task Master Foundation 01 remains the immediate next functional increment.`,
"baseline commit chain"
);

fs.writeFileSync(file, s, "utf8");

// Guard the final document so the previous numbering regression cannot return unnoticed.
const verify = fs.readFileSync(file, "utf8");
for (const required of [
  "## 10. Billing & Entitlements Foundation",
  "## 11. Audit",
  "## 18. Current Validated Test Baseline",
  "## 20. Immediate Next Development Target",
  "## 22. Baseline Commit Chain",
  "`41af015 Harden Work Area QR authorization and idempotency`",
  "Total integration: **32/32 PASS**",
  "Tests: **46/46 PASS**",
  "**Task Master Foundation 01**",
]) {
  if (!verify.includes(required)) throw new Error(`Final context verification failed: ${required}`);
}

console.log("Updated vNext continuity to validated Hardening 02 baseline 41af015.");
