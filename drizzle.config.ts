import { defineConfig } from "drizzle-kit";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required for Drizzle commands.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
