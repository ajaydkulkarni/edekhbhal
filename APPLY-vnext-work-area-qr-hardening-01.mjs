import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const migration = "drizzle/0004_work_area_qr_foundation.sql";
const qrPage = "src/app/workspace/work-areas/[id]/qr/page.tsx";
const context = "docs/VNEXT-PROJECT-CONTEXT.md";
const testFile = "tests/module/work-area-qr-hardening-contract.test.ts";

for (const file of [migration, qrPage, context]) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);
}

// 1) Repair clean-replay SQL helper quoting.
let sql = fs.readFileSync(migration, "utf8");
const helperStart = sql.indexOf("create or replace function app_private.new_public_qr_token()");
const helperEndMarker = "revoke all on function app_private.new_public_qr_token() from public;";
const helperEnd = sql.indexOf(helperEndMarker, helperStart);
if (helperStart < 0 || helperEnd < 0) {
  throw new Error("Could not locate new_public_qr_token helper in 0004.");
}
let helper = sql.slice(helperStart, helperEnd);
if (helper.includes("as $\n") && helper.includes("\n$;")) {
  helper = helper.replace("as $\n", "as $$\n").replace("\n$;", "\n$$;");
  sql = sql.slice(0, helperStart) + helper + sql.slice(helperEnd);
} else if (!(helper.includes("as $$\n") && helper.includes("\n$$;"))) {
  throw new Error("Unexpected new_public_qr_token quoting; refusing unsafe rewrite.");
}
fs.writeFileSync(migration, sql, "utf8");

// 2) Use centralized brand configuration on the printable QR label.
let page = fs.readFileSync(qrPage, "utf8");
const brandImport = 'import { brand } from "@/lib/brand";';
if (!page.includes(brandImport)) {
  const anchor = 'import { requireAuthenticatedUser } from "@/lib/auth/server-session";';
  if (!page.includes(anchor)) throw new Error("QR page import anchor not found.");
  page = page.replace(anchor, `${brandImport}\n${anchor}`);
}
if (page.includes('<div className="qrBrand">Operations Platform</div>')) {
  page = page.replace(
    '<div className="qrBrand">Operations Platform</div>',
    '<div className="qrBrand">{brand.productName}</div>'
  );
} else if (!page.includes('<div className="qrBrand">{brand.productName}</div>')) {
  throw new Error("Unexpected QR brand markup; refusing unsafe rewrite.");
}
fs.writeFileSync(qrPage, page, "utf8");

// 3) Correct context numbering after the Work Area section insertion.
// The context updater has already been run locally, so preserve all of its validated content.
let ctx = fs.readFileSync(context, "utf8");
if (ctx.includes("## 21. Baseline Commit Chain")) {
  ctx = ctx.replace("## 21. Baseline Commit Chain", "## 22. Baseline Commit Chain");
} else if (!ctx.includes("## 22. Baseline Commit Chain")) {
  throw new Error("Could not locate Baseline Commit Chain heading in expected state.");
}
fs.writeFileSync(context, ctx, "utf8");

// 4) Add a regression contract so clean-replay quoting and centralized branding cannot regress silently.
const test = `import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Work Area + QR hardening contract", () => {
  it("keeps the clean-replay QR token helper validly dollar-quoted", () => {
    const sql = fs.readFileSync("drizzle/0004_work_area_qr_foundation.sql", "utf8");
    const start = sql.indexOf("create or replace function app_private.new_public_qr_token()");
    const end = sql.indexOf("revoke all on function app_private.new_public_qr_token() from public;", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const helper = sql.slice(start, end);
    expect(helper).toContain("as $$");
    expect(helper).toContain("$$;");
    expect(helper).not.toContain("as $\\\\n");
  });

  it("uses centralized product branding on the printable QR label", () => {
    const page = fs.readFileSync("src/app/workspace/work-areas/[id]/qr/page.tsx", "utf8");
    expect(page).toContain('import { brand } from "@/lib/brand";');
    expect(page).toContain('<div className="qrBrand">{brand.productName}</div>');
    expect(page).not.toContain('<div className="qrBrand">Operations Platform</div>');
  });

  it("keeps the continuity document section numbering aligned", () => {
    const context = fs.readFileSync("docs/VNEXT-PROJECT-CONTEXT.md", "utf8");
    expect(context).toContain("## 22. Baseline Commit Chain");
    expect(context).not.toContain("## 21. Baseline Commit Chain");
  });
});
`;
fs.mkdirSync(path.dirname(testFile), { recursive: true });
fs.writeFileSync(testFile, test, "utf8");

execSync(`npx eslint "${qrPage}" "${testFile}"`, { stdio: "inherit" });
console.log("Work Area + QR hardening correction applied.");
console.log("Next: npm run typecheck && npm run test && npm run lint && npm run build && npm run test:e2e");
