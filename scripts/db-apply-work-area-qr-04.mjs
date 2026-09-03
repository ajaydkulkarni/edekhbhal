import fs from "node:fs";
import postgres from "postgres";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
try {
  await sql.unsafe(fs.readFileSync("drizzle/0004_work_area_qr_foundation.sql", "utf8"));
  console.log("Work Area + QR Lifecycle Foundation migration applied.");
} finally {
  await sql.end({ timeout: 5 });
}
