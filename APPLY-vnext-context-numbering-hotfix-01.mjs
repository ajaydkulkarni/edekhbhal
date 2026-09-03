import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const contextFile = "docs/VNEXT-PROJECT-CONTEXT.md";
const testFile = "tests/module/work-area-qr-hardening-contract.test.ts";

for (const file of [contextFile, testFile]) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);
}

let context = fs.readFileSync(contextFile, "utf8");

const billingWrong = "## 11. Billing & Entitlements Foundation";
const auditWrong = "## 10. Audit";
const billingRight = "## 10. Billing & Entitlements Foundation";
const auditRight = "## 11. Audit";

if (context.includes(billingRight) && context.includes(auditRight)) {
  console.log("Continuity section numbering is already corrected.");
} else {
  if (!context.includes(billingWrong) || !context.includes(auditWrong)) {
    throw new Error("Expected Billing/Audit heading state was not found; refusing unsafe rewrite.");
  }
  context = context
    .replace(billingWrong, "__VNEXT_BILLING_HEADING__")
    .replace(auditWrong, auditRight)
    .replace("__VNEXT_BILLING_HEADING__", billingRight);

  fs.writeFileSync(contextFile, context, "utf8");
}

let test = fs.readFileSync(testFile, "utf8");
const anchor = `    expect(context).toContain("## 22. Baseline Commit Chain");
    expect(context).not.toContain("## 21. Baseline Commit Chain");`;

const expanded = `    expect(context).toContain("## 10. Billing & Entitlements Foundation");
    expect(context).toContain("## 11. Audit");
    expect(context.indexOf("## 10. Billing & Entitlements Foundation")).toBeLessThan(
      context.indexOf("## 11. Audit"),
    );
    expect(context).toContain("## 22. Baseline Commit Chain");
    expect(context).not.toContain("## 21. Baseline Commit Chain");`;

if (!test.includes('expect(context).toContain("## 10. Billing & Entitlements Foundation");')) {
  if (!test.includes(anchor)) {
    throw new Error("Hardening contract test anchor not found; refusing unsafe rewrite.");
  }
  test = test.replace(anchor, expanded);
  fs.writeFileSync(testFile, test, "utf8");
}

execSync(`npx vitest run "${testFile}"`, { stdio: "inherit" });
execSync(`npx eslint "${testFile}"`, { stdio: "inherit" });

console.log("vNext continuity numbering corrected and regression contract passed.");
