import { execSync } from "node:child_process";
import postgres from "postgres";

const PROJECT_REF = "lyavrhmmndqdwdyzxuoq";
const POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") {
  throw new Error(`Expected vNext branch, got ${branch}`);
}

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) {
  throw new Error("SUPABASE_DB_PASSWORD is not set.");
}

const adminUrl =
  `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(dbPassword)}` +
  `@${POOLER_HOST}:5432/postgres`;

const sql = postgres(adminUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});

async function main() {
  try {
    const roles = await sql`
      select rolname
      from pg_roles
      where rolname in ('vnext_migrator', 'vnext_runtime')
      order by rolname
    `;

    const names = roles.map((r) => r.rolname);
    if (!names.includes("vnext_migrator") || !names.includes("vnext_runtime")) {
      throw new Error("Expected vNext roles are missing. Stop and report this output.");
    }

    // Least privilege: migrator may create schemas/objects inside postgres,
    // but may not create entirely new databases.
    await sql`alter role vnext_migrator nocreatedb`;
    await sql`grant connect, create on database postgres to vnext_migrator`;
    await sql`grant connect on database postgres to vnext_runtime`;

    // Runtime must never create schemas.
    await sql`revoke create on database postgres from vnext_runtime`;

    const checks = await sql`
      select
        r.rolname,
        r.rolcreatedb,
        r.rolbypassrls,
        has_database_privilege(r.rolname, 'postgres', 'CONNECT') as can_connect,
        has_database_privilege(r.rolname, 'postgres', 'CREATE') as can_create_in_database
      from pg_roles r
      where r.rolname in ('vnext_migrator', 'vnext_runtime')
      order by r.rolname
    `;

    for (const r of checks) {
      console.log(
        `${r.rolname}: createdb=${r.rolcreatedb} bypassrls=${r.rolbypassrls} ` +
        `connect=${r.can_connect} create_in_database=${r.can_create_in_database}`
      );
    }

    const migrator = checks.find((r) => r.rolname === "vnext_migrator");
    const runtime = checks.find((r) => r.rolname === "vnext_runtime");

    if (
      !migrator ||
      migrator.rolcreatedb ||
      !migrator.rolbypassrls ||
      !migrator.can_connect ||
      !migrator.can_create_in_database
    ) {
      throw new Error("vnext_migrator privilege verification failed.");
    }

    if (
      !runtime ||
      runtime.rolcreatedb ||
      runtime.rolbypassrls ||
      !runtime.can_connect ||
      runtime.can_create_in_database
    ) {
      throw new Error("vnext_runtime privilege verification failed.");
    }

    console.log("Database privilege repair 02 completed successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("");
  console.error("Database privilege repair 02 FAILED:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
