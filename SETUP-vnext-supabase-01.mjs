import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import postgres from "postgres";

const PROJECT_REF = "lyavrhmmndqdwdyzxuoq";
const PROJECT_URL = "https://lyavrhmmndqdwdyzxuoq.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_2rxP2QP1OVj902FzsD0afw_tO5ec2zA";
const POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext, got ${branch}`);

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) throw new Error("SUPABASE_DB_PASSWORD is not set.");

const migratorPassword = crypto.randomBytes(32).toString("base64url");
const runtimePassword = crypto.randomBytes(32).toString("base64url");

const adminUrl = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(dbPassword)}@${POOLER_HOST}:5432/postgres`;
const sql = postgres(adminUrl, { max: 1, connect_timeout: 15, idle_timeout: 5, prepare: false, ssl: "require" });

async function main() {
  try {
    const who = await sql`select current_user as current_user, current_database() as current_database`;
    console.log(`Connected to ${who[0].current_database} as ${who[0].current_user}.`);

    const existing = await sql`
      select rolname from pg_roles
      where rolname in ('vnext_migrator','vnext_runtime')
      order by rolname
    `;
    if (existing.length) {
      throw new Error(`Existing vNext role(s): ${existing.map(r => r.rolname).join(", ")}. Refusing to overwrite.`);
    }

    await sql.unsafe(`create role vnext_migrator with login password '${migratorPassword}' nosuperuser inherit createdb nocreaterole noreplication bypassrls`);
    await sql.unsafe(`create role vnext_runtime with login password '${runtimePassword}' nosuperuser inherit nocreatedb nocreaterole noreplication nobypassrls`);

    await sql`grant connect on database postgres to vnext_migrator, vnext_runtime`;
    await sql`grant usage, create on schema public to vnext_migrator`;
    await sql`grant usage on schema public to vnext_runtime`;
    await sql`alter default privileges for role vnext_migrator in schema public grant select, insert, update, delete on tables to vnext_runtime`;
    await sql`alter default privileges for role vnext_migrator in schema public grant usage, select on sequences to vnext_runtime`;

    const check = await sql`
      select rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_roles
      where rolname in ('vnext_migrator','vnext_runtime')
      order by rolname
    `;

    const runtimeUrl = `postgresql://vnext_runtime.${PROJECT_REF}:${encodeURIComponent(runtimePassword)}@${POOLER_HOST}:6543/postgres`;
    const migrationUrl = `postgresql://vnext_migrator.${PROJECT_REF}:${encodeURIComponent(migratorPassword)}@${POOLER_HOST}:5432/postgres`;

    const env = [
      "# vNext local environment — generated automatically",
      "# DO NOT COMMIT THIS FILE",
      `NEXT_PUBLIC_SUPABASE_URL=${PROJECT_URL}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}`,
      `DATABASE_URL=${runtimeUrl}`,
      `MIGRATION_DATABASE_URL=${migrationUrl}`,
      "NEXT_PUBLIC_PRODUCT_NAME=Operations Platform",
      "NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com",
      ""
    ].join("\n");

    fs.writeFileSync(".env.local", env, { encoding: "utf8", mode: 0o600 });

    for (const r of check) {
      console.log(`${r.rolname}: super=${r.rolsuper} createdb=${r.rolcreatedb} createrole=${r.rolcreaterole} replication=${r.rolreplication} bypassrls=${r.rolbypassrls}`);
    }
    console.log("Created .env.local. Database owner password was not stored.");
    console.log("Supabase bootstrap 01 completed successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("Supabase bootstrap 01 FAILED:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
