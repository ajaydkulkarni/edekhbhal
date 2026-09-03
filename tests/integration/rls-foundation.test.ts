import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!runtimeUrl || !migrationUrl) {
  throw new Error("DATABASE_URL and MIGRATION_DATABASE_URL are required for integration tests.");
}

const runtime = postgres(runtimeUrl, {
  max: 6,
  prepare: false,
  ssl: "require",
});

const migrator = postgres(migrationUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
});

const ids = {
  orgA: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  userShared: "20000000-0000-4000-8000-000000000001",
  memberA: "30000000-0000-4000-8000-000000000001",
  memberB: "30000000-0000-4000-8000-000000000002",
  memberOtherA: "30000000-0000-4000-8000-000000000003",
};

async function withContext<T>(
  organizationId: string,
  userId: string,
  membershipId: string,
  fn: (tx: postgres.TransactionSql<{}>) => Promise<T>,
): Promise<T> {
  const result = await runtime.begin(async (tx) => {
    await tx`select set_config('app.organization_id', ${organizationId}, true)`;
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.membership_id', ${membershipId}, true)`;
    return fn(tx);
  });

  return result as T;
}

describe("RLS Foundation 01", () => {
  beforeAll(async () => {
    const rows = await migrator`select count(*)::int as count from organization`;
    expect(rows[0].count).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    await runtime.end({ timeout: 5 });
    await migrator.end({ timeout: 5 });
  });

  it("isolates Organization A", async () => {
    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx`select id, name from organization order by id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids.orgA);
  });

  it("allows the same User to switch independently to Organization B", async () => {
    const rows = await withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
      tx`select id, name from organization order by id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids.orgB);
  });

  it("fails closed when membership and Organization are mismatched", async () => {
    const rows = await withContext(ids.orgB, ids.userShared, ids.memberA, (tx) =>
      tx`select id from organization`,
    );
    expect(rows).toHaveLength(0);
  });

  it("clears transaction-local tenant context after commit", async () => {
    await withContext(ids.orgA, ids.userShared, ids.memberA, async (tx) => {
      const inside = await tx`select id from organization`;
      expect(inside).toHaveLength(1);
    });

    const outside = await runtime`select id from organization`;
    expect(outside).toHaveLength(0);
  });

  it("keeps concurrent Organization contexts isolated", async () => {
    const [a, b] = await Promise.all([
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx`select id from organization`,
      ),
      withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
        tx`select id from organization`,
      ),
    ]);

    expect(a.map((r) => r.id)).toEqual([ids.orgA]);
    expect(b.map((r) => r.id)).toEqual([ids.orgB]);
  });

  it("lets an ADMIN see memberships in only the active Organization", async () => {
    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx`select id, organization_id, user_id from organization_membership order by id`,
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.organization_id === ids.orgA)).toBe(true);
  });

  it("lets a non-admin see only their own membership", async () => {
    const rows = await withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
      tx`select id from organization_membership order by id`,
    );

    expect(rows.map((r) => r.id)).toEqual([ids.memberB]);
  });

  it("enforces immutable Organization name even for ADMIN", async () => {
    await expect(
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx`update organization set name = 'Changed Name' where id = ${ids.orgA}`,
      ),
    ).rejects.toThrow(/organization name is immutable/i);
  });

  it("allows ADMIN to update permitted Organization fields", async () => {
    await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx`update organization set default_currency_code = 'USD', version = version + 1 where id = ${ids.orgA}`,
    );

    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx`select default_currency_code from organization where id = ${ids.orgA}`,
    );

    expect(rows[0].default_currency_code).toBe("USD");
  });

  it("prevents USER role from updating Organization", async () => {
    const result = await withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
      tx`update organization set default_currency_code = 'USD' where id = ${ids.orgB} returning id`,
    );
    expect(result).toHaveLength(0);
  });

  it("accepts an audit event only for the active actor context", async () => {
    const auditId = "40000000-0000-4000-8000-000000000001";

    await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx`
        insert into audit_event (
          id, organization_id, actor_user_id, actor_membership_id,
          actor_display_name_snapshot, ip_address, module_code, action_code,
          entity_type, entity_id, old_value_json, new_value_json, source_channel
        )
        values (
          ${auditId}, ${ids.orgA}, ${ids.userShared}, ${ids.memberA},
          'Shared Test User', '127.0.0.1', 'ORGANIZATION', 'UPDATE',
          'Organization', ${ids.orgA},
          '{"defaultCurrencyCode":"USD"}'::jsonb,
          '{"defaultCurrencyCode":"USD"}'::jsonb,
          'API'
        )
        on conflict (id) do nothing
      `,
    );

    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx`select id, module_code, action_code from audit_event where id = ${auditId}`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].module_code).toBe("ORGANIZATION");
  });

  it("keeps Audit append-only for runtime", async () => {
    await expect(
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx`delete from audit_event where organization_id = ${ids.orgA}`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("prevents a mismatched actor from writing an audit event", async () => {
    await expect(
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx`
          insert into audit_event (
            organization_id, actor_user_id, actor_membership_id,
            module_code, action_code, entity_type, entity_id, source_channel
          )
          values (
            ${ids.orgA}, ${ids.userShared}, ${ids.memberOtherA},
            'SECURITY', 'INVALID', 'Organization', ${ids.orgA}, 'API'
          )
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
