import fs from "node:fs";
import postgres from "postgres";

const migrationPath =
  "drizzle/0024_occurrence_generation_claim_eligibility.sql";

const databaseUrl =
  process.env.MIGRATION_DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL is required."
  );
}

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

const db =
  postgres(
    databaseUrl,
    {
      max: 1,
      prepare: false,
      ssl: "require"
    }
  );

try {

  console.log(
    "Applying migration 0024 occurrence generation claim eligibility..."
  );

  await db.begin(
    async sql => {
      await sql.unsafe(
        migration
      );
    }
  );

  console.log(
    "Migration 0024 applied successfully."
  );

} finally {

  await db.end({
    timeout: 5
  });

}
