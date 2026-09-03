import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "src/lib/tasks/actions.ts";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

const importBefore = `import { randomUUID } from "node:crypto";\n`;
if (s.includes(importBefore)) {
  s = s.replace(importBefore, "");
}

const fnBefore = `\nexport function newTaskIdempotencyKey() {\n  return randomUUID();\n}\n`;
if (s.includes(fnBefore)) {
  s = s.replace(fnBefore, "\n");
} else if (s.includes("newTaskIdempotencyKey")) {
  throw new Error("Unexpected newTaskIdempotencyKey shape; refusing partial edit.");
}

fs.writeFileSync(file, s, "utf8");

execSync(`npx eslint "${file}"`, { stdio: "inherit" });
execSync("npm run typecheck", { stdio: "inherit" });

console.log("Task Master Server Action export hotfix applied; ESLint and typecheck passed.");
console.log("Next: npm run build");
