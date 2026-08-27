import fs from "fs";
import path from "path";

function loadLocalEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadLocalEnvFile(".env.local");
  loadLocalEnvFile(".env");

  if (process.env.DEMO_SEED_CONFIRM !== "YES") {
    throw new Error(
      [
        "Demo seed blocked intentionally.",
        "This script writes realistic demo data to DATABASE_URL.",
        "",
        "PowerShell:",
        '$env:DEMO_SEED_CONFIRM="YES"; npm run db:seed:demo',
        "",
        "macOS/Linux:",
        "DEMO_SEED_CONFIRM=YES npm run db:seed:demo"
      ].join("\n")
    );
  }

  const { populateDemoData } = await import("../src/lib/demoSeed");
  const result = await populateDemoData({
    generateOccurrences: (process.env.DEMO_SEED_GENERATE_OCCURRENCES ?? "true").toLowerCase() !== "false"
  });

  console.log("");
  console.log("Demo seed completed successfully.");
  console.table(result.counts);
  console.log(`Occurrences generated: ${result.occurrences.created}`);
  console.log(`Candidates skipped outside working hours: ${result.occurrences.skippedOutsideWorkingHours}`);
  console.log("");
  console.log("Demo login emails:");
  for (const email of result.loginEmails) console.log(`- ${email}`);

  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
