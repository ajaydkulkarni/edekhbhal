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

const adminUrl =
  `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(dbPassword)}` +
  `@${POOLER_HOST}:5432/postgres`;

const admin = postgres(adminUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});

async function ensureRole(name, createSql, password) {
  const rows = await admin`
    select rolname from pg_roles where rolname = ${name}
  `;

  if (!rows.length) {
    await admin.unsafe(createSql);
    console.log(`Created ${name}.`);
  } else {
    console.log(`${name} already exists; preserving role and rotating bootstrap password.`);
  }

  // Identifier is fixed by this script; only password is generated locally.
  await admin.unsafe(
    `alter role ${name} password '${password}'`
  );
}

async function main() {
  let migrator;

  try {
    const who = await admin`
      select current_user as current_user, current_database() as current_database
    `;
    console.log(`Connected to ${who[0].current_database} as ${who[0].current_user}.`);

    await ensureRole(
      "vnext_migrator",
      `create role vnext_migrator
         with login
         password '${migratorPassword}'
         nosuperuser
         inherit
         createdb
         nocreaterole
         noreplication
         bypassrls`,
      migratorPassword,
    );

    await ensureRole(
      "vnext_runtime",
      `create role vnext_runtime
         with login
         password '${runtimePassword}'
         nosuperuser
         inherit
         nocreatedb
         nocreaterole
         noreplication
         nobypassrls`,
      runtimePassword,
    );

    await admin`grant connect on database postgres to vnext_migrator, vnext_runtime`;
    await admin`grant usage, create on schema public to vnext_migrator`;
    await admin`grant usage on schema public to vnext_runtime`;

    const migrationUrl =
      `postgresql://vnext_migrator.${PROJECT_REF}:${encodeURIComponent(migratorPassword)}` +
      `@${POOLER_HOST}:5432/postgres`;

    migrator = postgres(migrationUrl, {
      max: 1,
      connect_timeout: 15,
      idle_timeout: 5,
      prepare: false,
      ssl: "require",
    });

    const migratorWho = await migrator`
      select current_user as current_user
    `;
    console.log(`Connected as ${migratorWho[0].current_user} to establish its own default privileges.`);

    // This must be executed by the role whose future objects are affected.
    await migrator`
      alter default privileges in schema public
      grant select, insert, update, delete on tables to vnext_runtime
    `;

    await migrator`
      alter default privileges in schema public
      grant usage, select on sequences to vnext_runtime
    `;

    const check = await admin`
      select
        rolname,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolreplication,
        rolbypassrls
      from pg_roles
      where rolname in ('vnext_migrator', 'vnext_runtime')
      order by rolname
    `;

    const runtimeUrl =
      `postgresql://vnext_runtime.${PROJECT_REF}:${encodeURIComponent(runtimePassword)}` +
      `@${POOLER_HOST}:6543/postgres`;

    const env = [
      "# vNext local environment — generated automatically",
      "# DO NOT COMMIT THIS FILE",
      `NEXT_PUBLIC_SUPABASE_URL=${PROJECT_URL}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}`,
      `DATABASE_URL=${runtimeUrl}`,
      `MIGRATION_DATABASE_URL=${migrationUrl}`,
      "NEXT_PUBLIC_PRODUCT_NAME=Operations Platform",
      "NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com",
      "",
    ].join("\n");

    fs.writeFileSync(".env.local", env, {
      encoding: "utf8",
      mode: 0o600,
    });

    console.log("");
    for (const r of check) {
      console.log(
        `${r.rolname}: super=${r.rolsuper} createdb=${r.rolcreatedb} ` +
        `createrole=${r.rolcreaterole} replication=${r.rolreplication} ` +
        `bypassrls=${r.rolbypassrls}`
      );
    }

    console.log("");
    console.log("Default privileges established by vnext_migrator itself.");
    console.log("Created .env.local with fresh vNext role credentials.");
    console.log("Database owner password was NOT stored.");
    console.log("Supabase bootstrap repair completed successfully.");
  } finally {
    if (migrator) await migrator.end({ timeout: 5 });
    await admin.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("");
  console.error("Supabase bootstrap repair FAILED:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
