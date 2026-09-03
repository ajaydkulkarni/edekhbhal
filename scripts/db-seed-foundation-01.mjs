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

const ids = {
  orgA: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  userShared: "20000000-0000-4000-8000-000000000001",
  userOther: "20000000-0000-4000-8000-000000000002",
  memberA: "30000000-0000-4000-8000-000000000001",
  memberB: "30000000-0000-4000-8000-000000000002",
  memberOtherA: "30000000-0000-4000-8000-000000000003",
};

try {
  await sql.begin(async (tx) => {
    await tx`
      insert into organization
        (id, name, country_code, default_currency_code, default_timezone, status)
      values
        (${ids.orgA}, 'Foundation Hospitality', 'US', 'USD', 'America/Denver', 'ACTIVE'),
        (${ids.orgB}, 'Foundation Manufacturing', 'IN', 'INR', 'Asia/Kolkata', 'ACTIVE')
      on conflict (id) do nothing
    `;

    await tx`
      insert into app_user
        (id, auth_subject, email, display_name, preferred_language, status)
      values
        (${ids.userShared}, 'seed-shared-user', 'shared@example.test', 'Shared Test User', 'en', 'ACTIVE'),
        (${ids.userOther}, 'seed-other-user', 'other@example.test', 'Other Test User', 'en', 'ACTIVE')
      on conflict (id) do nothing
    `;

    await tx`
      insert into organization_membership
        (id, organization_id, user_id, role_code, status)
      values
        (${ids.memberA}, ${ids.orgA}, ${ids.userShared}, 'ADMIN', 'ACTIVE'),
        (${ids.memberB}, ${ids.orgB}, ${ids.userShared}, 'USER', 'ACTIVE'),
        (${ids.memberOtherA}, ${ids.orgA}, ${ids.userOther}, 'USER', 'ACTIVE')
      on conflict (id) do nothing
    `;
  });

  console.log("Database Foundation 01 deterministic seed applied.");
} finally {
  await sql.end({ timeout: 5 });
}
