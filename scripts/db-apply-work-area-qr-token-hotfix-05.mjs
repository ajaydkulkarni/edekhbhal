import fs from "node:fs";
import postgres from "postgres";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
try {
  await sql.unsafe(fs.readFileSync("drizzle/0005_work_area_qr_token_hotfix.sql", "utf8"));
  const rows = await sql`
    select
      length(app_private.new_public_qr_token()) as token_length,
      app_private.new_public_qr_token() ~ '^[a-f0-9]{48}$' as token_format_ok
  `;
  if (Number(rows[0].token_length) !== 48 || rows[0].token_format_ok !== true) {
    throw new Error("QR token hotfix verification failed.");
  }
  console.log("Work Area + QR public token hotfix applied and verified.");
} finally {
  await sql.end({ timeout: 5 });
}
