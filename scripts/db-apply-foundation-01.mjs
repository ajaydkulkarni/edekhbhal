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
  const migration = fs.readFileSync("drizzle/0001_rls_foundation.sql", "utf8");
  await sql.unsafe(migration);
  console.log("Database Foundation 01 migration applied successfully.");
} finally {
  await sql.end({ timeout: 5 });
}
