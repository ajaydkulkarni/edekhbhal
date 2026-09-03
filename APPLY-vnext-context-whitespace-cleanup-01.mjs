import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "docs/VNEXT-PROJECT-CONTEXT.md";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

// Remove trailing spaces/tabs from every line without changing content.
s = s
  .split("\n")
  .map((line) => line.replace(/[ \t]+$/g, ""))
  .join("\n");

fs.writeFileSync(file, s, "utf8");

execSync(`git --no-pager diff --check -- "${file}"`, { stdio: "inherit" });

for (const required of [
  "**Latest validated vNext baseline:** `41af015`",
  "### Work Area + QR Hardening 02",
  "Total integration: **32/32 PASS**",
  "Tests: **46/46 PASS**",
  "## 20. Immediate Next Development Target",
  "**Task Master Foundation 01**",
  "## 22. Baseline Commit Chain",
]) {
  if (!s.includes(required)) {
    throw new Error(`Required continuity marker missing after whitespace cleanup: ${required}`);
  }
}

console.log("Continuity trailing whitespace removed; diff check passed.");
