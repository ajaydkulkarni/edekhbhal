import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "tests/integration/task-master-foundation.test.ts";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

const bad = `    const before = await asAdmin((tx) => tx<{ version: number }[]>\`
      select version from task_master where id=\${ids.task}
    \`;`;

const good = `    const before = await asAdmin((tx) => tx<{ version: number }[]>\`
      select version from task_master where id=\${ids.task}
    \`);`;

if (s.includes(bad)) {
  s = s.replace(bad, good);
  fs.writeFileSync(file, s, "utf8");
} else if (!s.includes(good)) {
  throw new Error("Expected Task Master test syntax anchor was not found; refusing to guess.");
}

execSync(
  "npx eslint src/lib/tasks/server.ts src/lib/tasks/actions.ts src/app/workspace/tasks/page.tsx src/app/workspace/page.tsx src/app/demo/page.tsx tests/integration/task-master-foundation.test.ts tests/module/task-master-contract.test.ts e2e/work-area-qr-demo.spec.ts scripts/db-apply-task-master-07.mjs",
  { stdio: "inherit" }
);

console.log("Task Master Foundation 01 syntax hotfix applied; focused ESLint passed.");
