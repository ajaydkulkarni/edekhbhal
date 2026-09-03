import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "tests/integration/schedule-master-foundation.test.ts";
if (!fs.existsSync(file)) throw new Error(`${file} is missing. Run the Schedule Master installer first.`);

const before = "const before=await asManager(tx=>tx<{version:string}[]>`select version from schedule_master where id=${ids.schedule}`;";
const after = "const before=await asManager(tx=>tx<{version:string}[]>`select version from schedule_master where id=${ids.schedule}`);";

let source = fs.readFileSync(file, "utf8");
if (source.includes(after)) {
  console.log("Syntax hotfix is already present.");
} else {
  if (!source.includes(before)) {
    throw new Error("Expected syntax anchor was not found. Refusing to guess.");
  }
  source = source.replace(before, after);
  fs.writeFileSync(file, source, "utf8");
  console.log("Corrected missing closing parenthesis in Schedule integration test.");
}

execSync(
  "npx eslint src/lib/schedules/model.ts src/lib/schedules/server.ts src/lib/schedules/actions.ts src/app/workspace/schedules/page.tsx src/app/workspace/page.tsx src/app/demo/page.tsx tests/integration/schedule-master-foundation.test.ts tests/module/schedule-master-contract.test.ts tests/unit/schedule-intent.test.ts e2e/work-area-qr-demo.spec.ts scripts/db-apply-schedule-master-08.mjs",
  { stdio: "inherit" }
);
execSync("npm run typecheck", { stdio: "inherit" });
execSync("git --no-pager diff --check", { stdio: "inherit" });

console.log("Schedule Master syntax hotfix applied; focused ESLint, typecheck, and diff check passed.");
console.log("Next: npm run db:schedule-master:apply");
