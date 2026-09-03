import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

if (!fs.existsSync(".env.local")) throw new Error(".env.local is missing.");
if (!fs.existsSync("package.json")) throw new Error("package.json is missing.");

const migration = `-- Database Foundation 01 privilege hardening
-- Remove broad runtime defaults and establish explicit least-privilege grants.

alter default privileges in schema public
  revoke all on tables from vnext_runtime;

alter default privileges in schema public
  revoke all on sequences from vnext_runtime;

revoke all on table
  organization,
  app_user,
  organization_membership,
  audit_event,
  outbox_event
from vnext_runtime;

grant select, update on organization to vnext_runtime;
grant select, update on app_user to vnext_runtime;
grant select, insert, update on organization_membership to vnext_runtime;
grant select, insert on audit_event to vnext_runtime;
grant insert on outbox_event to vnext_runtime;

-- Defense in depth: explicitly revoke mutation capabilities that must never exist.
revoke insert, delete on organization from vnext_runtime;
revoke insert, delete on app_user from vnext_runtime;
revoke delete on organization_membership from vnext_runtime;
revoke update, delete on audit_event from vnext_runtime;
revoke select, update, delete on outbox_event from vnext_runtime;
`;

const apply = `import fs from "node:fs";
import postgres from "postgres";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: "require",
});

try {
  const migration = fs.readFileSync("drizzle/0002_runtime_privilege_hardening.sql", "utf8");
  await sql.unsafe(migration);

  const checks = await sql\`
    select
      has_table_privilege('vnext_runtime','organization','SELECT') as org_select,
      has_table_privilege('vnext_runtime','organization','UPDATE') as org_update,
      has_table_privilege('vnext_runtime','organization','DELETE') as org_delete,
      has_table_privilege('vnext_runtime','audit_event','SELECT') as audit_select,
      has_table_privilege('vnext_runtime','audit_event','INSERT') as audit_insert,
      has_table_privilege('vnext_runtime','audit_event','UPDATE') as audit_update,
      has_table_privilege('vnext_runtime','audit_event','DELETE') as audit_delete,
      has_table_privilege('vnext_runtime','outbox_event','INSERT') as outbox_insert,
      has_table_privilege('vnext_runtime','outbox_event','SELECT') as outbox_select,
      has_table_privilege('vnext_runtime','outbox_event','UPDATE') as outbox_update,
      has_table_privilege('vnext_runtime','outbox_event','DELETE') as outbox_delete
  \`;

  const c = checks[0];

  if (
    !c.org_select ||
    !c.org_update ||
    c.org_delete ||
    !c.audit_select ||
    !c.audit_insert ||
    c.audit_update ||
    c.audit_delete ||
    !c.outbox_insert ||
    c.outbox_select ||
    c.outbox_update ||
    c.outbox_delete
  ) {
    throw new Error("Runtime privilege verification failed.");
  }

  console.log("Runtime privilege hardening applied and verified.");
  console.log(
    "audit_event: SELECT=true INSERT=true UPDATE=false DELETE=false"
  );
  console.log(
    "outbox_event: INSERT=true SELECT=false UPDATE=false DELETE=false"
  );
} finally {
  await sql.end({ timeout: 5 });
}
`;

fs.mkdirSync("drizzle", { recursive: true });
fs.mkdirSync("scripts", { recursive: true });

fs.writeFileSync(
  "drizzle/0002_runtime_privilege_hardening.sql",
  migration,
  "utf8",
);
fs.writeFileSync(
  "scripts/db-apply-privilege-hardening-02.mjs",
  apply,
  "utf8",
);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts["db:privileges:harden"] =
  "node scripts/db-apply-privilege-hardening-02.mjs";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n", "utf8");

execSync("node --check scripts/db-apply-privilege-hardening-02.mjs", {
  stdio: "inherit",
});

console.log("Privilege Hotfix 02 files written.");
console.log("Next: npm run db:privileges:harden");
