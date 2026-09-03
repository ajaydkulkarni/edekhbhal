import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "e2e/work-area-qr-demo.spec.ts";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

const before = `  await expect(page.getByText(/no Base64 media/i)).toBeVisible();`;
const after = `  const firstTask = page.getByRole("article").filter({ hasText: "Clean main entrance glass" });
  await expect(firstTask.getByText(/no Base64 media/i)).toBeVisible();`;

if (s.includes(before)) {
  s = s.replace(before, after);
  fs.writeFileSync(file, s, "utf8");
} else if (!s.includes(after)) {
  throw new Error("Expected Demo Task Base64 assertion anchor was not found; refusing to guess.");
}

execSync(`npx eslint "${file}"`, { stdio: "inherit" });

console.log("Task Master Demo E2E locator hotfix applied; ESLint passed.");
console.log("Next: npm run test:e2e");
