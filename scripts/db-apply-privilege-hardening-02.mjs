import fs from "node:fs";
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

  const checks = await sql`
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
  `;

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
