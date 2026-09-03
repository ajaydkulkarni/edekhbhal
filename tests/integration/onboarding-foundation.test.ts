import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!runtimeUrl || !migrationUrl) throw new Error("Database URLs are required.");

const runtime = postgres(runtimeUrl, { max: 2, prepare: false, ssl: "require" });
const migrator = postgres(migrationUrl, { max: 1, prepare: false, ssl: "require" });

const subject = `integration-onboarding-${Date.now()}@example.test`;

async function asSubject<T>(fn: (tx: postgres.TransactionSql<{}>) => Promise<T>) {
  const result = await runtime.begin(async (tx) => {
    await tx`select set_config('app.auth_subject', ${subject}, true)`;
    return fn(tx);
  });
  return result as T;
}

describe("Authentication + onboarding database boundary", () => {
  let organizationId = "";
  let membershipId = "";
  let appUserId = "";
  let siteId = "";

  afterAll(async () => {
    if (organizationId) {
      await migrator`delete from audit_event where organization_id = ${organizationId}`;
      await migrator`delete from site where organization_id = ${organizationId}`;
      await migrator`delete from organization_subscription where organization_id = ${organizationId}`;
      await migrator`delete from organization_membership where organization_id = ${organizationId}`;
      await migrator`delete from organization where id = ${organizationId}`;
    }
    if (appUserId) await migrator`delete from app_user where id = ${appUserId}`;
    await runtime.end({ timeout: 5 });
    await migrator.end({ timeout: 5 });
  });

  it("starts at REGISTERED and syncs an authenticated profile", async () => {
    const before = await asSubject((tx) => tx`select * from app_private.get_current_onboarding_snapshot()`);
    expect(before[0].onboarding_state).toBe("REGISTERED");

    const rows = await asSubject((tx) => tx`
      select app_private.upsert_current_app_user(${subject}, 'Onboarding Test User') as id
    `);
    appUserId = rows[0].id;

    const after = await asSubject((tx) => tx`select * from app_private.get_current_onboarding_snapshot()`);
    expect(after[0].onboarding_state).toBe("PROFILE_COMPLETED");
  });

  it("bootstraps exactly one initial Organization with ADMIN membership", async () => {
    const rows = await asSubject((tx) => tx`
      select * from app_private.bootstrap_current_organization(
        'Onboarding Integration Org', 'US', 'USD', 'America/Denver'
      )
    `);
    organizationId = rows[0].organization_id;
    membershipId = rows[0].membership_id;

    expect(rows[0].user_id).toBe(appUserId);

    const snapshot = await asSubject((tx) => tx`select * from app_private.get_current_onboarding_snapshot()`);
    expect(snapshot[0].role_code).toBe("ADMIN");
    expect(snapshot[0].onboarding_state).toBe("ORGANIZATION_CREATED");

    await expect(
      asSubject((tx) => tx`
        select * from app_private.bootstrap_current_organization(
          'Second Org Must Fail', 'US', 'USD', 'America/Denver'
        )
      `),
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects paid activation without a billing adapter and activates Free Beta", async () => {
    await expect(
      asSubject((tx) => tx`
        select app_private.activate_current_free_plan(${organizationId}, 'STANDARD')
      `),
    ).rejects.toThrow(/billing provider adapter/i);

    await asSubject((tx) => tx`
      select app_private.activate_current_free_plan(${organizationId}, 'FREE_BETA')
    `);

    const snapshot = await asSubject((tx) => tx`select * from app_private.get_current_onboarding_snapshot()`);
    expect(snapshot[0].plan_code).toBe("FREE_BETA");
    expect(snapshot[0].onboarding_state).toBe("FREE_OR_SPONSORED_ACTIVATED");
  });

  it("creates the first Site and completes onboarding", async () => {
    const rows = await asSubject((tx) => tx`
      select app_private.create_current_first_site(
        ${organizationId}, 'Salt Lake Operations', 'SLC01',
        'America/Denver', 'US', '100 Test St', 'Salt Lake City', 'UT', '84101'
      ) as id
    `);
    siteId = rows[0].id;

    const snapshot = await asSubject((tx) => tx`select * from app_private.get_current_onboarding_snapshot()`);
    expect(snapshot[0].site_id).toBe(siteId);
    expect(snapshot[0].onboarding_state).toBe("ONBOARDING_COMPLETE");
  });

  it("proves the completed tenant is visible only through explicit transaction context", async () => {
    const noContext = await runtime`select id from site where id = ${siteId}`;
    expect(noContext).toHaveLength(0);

    const visible = await runtime.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${appUserId}, true)`;
      await tx`select set_config('app.organization_id', ${organizationId}, true)`;
      await tx`select set_config('app.membership_id', ${membershipId}, true)`;
      return tx`select id from site where id = ${siteId}`;
    });
    expect(visible).toHaveLength(1);
  });

  it("writes onboarding audit evidence", async () => {
    const rows = await migrator`
      select action_code
      from audit_event
      where organization_id = ${organizationId}
      order by timestamp_utc
    `;
    expect(rows.map((r) => r.action_code)).toEqual([
      "ORGANIZATION_CREATED",
      "FREE_PLAN_ACTIVATED",
      "SITE_CREATED",
    ]);
  });
});
