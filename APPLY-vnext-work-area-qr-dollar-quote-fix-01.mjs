import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "drizzle/0004_work_area_qr_foundation.sql";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let sql = fs.readFileSync(file, "utf8");

const start = sql.indexOf("create or replace function app_private.new_public_qr_token()");
const endMarker = "revoke all on function app_private.new_public_qr_token() from public;";
const end = sql.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate new_public_qr_token helper.");
}

const before = sql.slice(start, end);

if (before.includes("as $$\n") && before.includes("\n$$;")) {
  console.log("Clean-replay QR helper is already correctly dollar-quoted.");
} else {
  if (!before.includes("as $\n") || !before.includes("\n$;")) {
    throw new Error("Unexpected QR helper quoting; refusing unsafe rewrite.");
  }

  // IMPORTANT: use replacer functions because '$$' in a JS replacement string
  // is interpreted as one literal '$'.
  const fixed = before
    .replace("as $\n", () => "as $$\n")
    .replace("\n$;", () => "\n$$;");

  sql = sql.slice(0, start) + fixed + sql.slice(end);
  fs.writeFileSync(file, sql, "utf8");
}

const verify = fs.readFileSync(file, "utf8");
const vStart = verify.indexOf("create or replace function app_private.new_public_qr_token()");
const vEnd = verify.indexOf(endMarker, vStart);
const helper = verify.slice(vStart, vEnd);

if (!helper.includes("as $$\n") || !helper.includes("\n$$;")) {
  throw new Error("Dollar-quote repair verification failed.");
}

execSync("npx vitest run tests/module/work-area-qr-hardening-contract.test.ts", { stdio: "inherit" });
console.log("Clean-replay QR migration quoting repaired and contract test passed.");
