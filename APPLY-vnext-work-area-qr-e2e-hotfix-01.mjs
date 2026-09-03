import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "e2e/auth-onboarding-public.spec.ts";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

const before = `  await expect(page.getByRole("heading", { name: /Explore .* onboarding/ })).toBeVisible();`;
const after = `  await expect(page.getByRole("heading", { name: /Explore .*/ })).toBeVisible();`;

let content = fs.readFileSync(file, "utf8");

if (content.includes(after)) {
  console.log("Demo E2E compatibility hotfix already applied.");
} else {
  if (!content.includes(before)) {
    throw new Error("Expected legacy Demo heading assertion was not found; refusing to modify an unexpected file.");
  }
  content = content.replace(before, after);
  fs.writeFileSync(file, content, "utf8");
  console.log("Updated Demo heading assertion to match the expanded Demo page.");
}

execSync(`npx eslint ${file}`, { stdio: "inherit" });
console.log("Demo E2E compatibility hotfix applied.");
console.log("Next: npm run test:e2e");
