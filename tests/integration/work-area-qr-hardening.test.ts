import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!runtimeUrl || !migrationUrl) throw new Error("Database URLs are required.");

const runtime = postgres(runtimeUrl, { max: 6, prepare: false, ssl: "require" });
const migrator = postgres(migrationUrl, { max: 1, prepare: false, ssl: "require" });

const ids = {
  org: "",
  adminUser: "",
  adminMembership: "",
  managerUser: "",
  managerMembership: "",
  userUser: "",
  userMembership: "",
  siteA: "",
  siteB: "",
  workArea: "",
  token: "",
};

async function asContext<T>(
  userId: string,
  membershipId: string,
  fn: (tx: postgres.TransactionSql<{}>) => Promise<T>,
) {
  return runtime.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.organization_id', ${ids.org}, true)`;
    await tx`select set_config('app.membership_id', ${membershipId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

const asAdmin = <T>(fn: (tx: postgres.TransactionSql<{}>) => Promise<T>) =>
  asContext(ids.adminUser, ids.adminMembership, fn);

const asManager = <T>(fn: (tx: postgres.TransactionSql<{}>) => Promise<T>) =>
  asContext(ids.managerUser, ids.managerMembership, fn);

const asUser = <T>(fn: (tx: postgres.TransactionSql<{}>) => Promise<T>) =>
  asContext(ids.userUser, ids.userMembership, fn);

describe("Work Area + QR hardening database boundary", () => {
  afterAll(async () => {
    if (ids.org) {
      await migrator`delete from audit_event where organization_id=${ids.org}`;
      await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
      await migrator`delete from work_area_qr where organization_id=${ids.org}`;
      await migrator`delete from work_area where organization_id=${ids.org}`;
      await migrator`delete from site_membership_scope where organization_id=${ids.org}`;
      await migrator`delete from organization_subscription where organization_id=${ids.org}`;
      await migrator`delete from organization_membership where organization_id=${ids.org}`;
      await migrator`delete from site where organization_id=${ids.org}`;
      await migrator`delete from organization where id=${ids.org}`;
    }
    for (const userId of [ids.adminUser, ids.managerUser, ids.userUser]) {
      if (userId) await migrator`delete from app_user where id=${userId}`;
    }
    await runtime.end({ timeout: 5 });
    await migrator.end({ timeout: 5 });
  });

  it("creates scoped ADMIN, SITE_MANAGER, USER, and two-Site fixture", async () => {
    const suffix = Date.now().toString();
    const rows = await migrator`
      with o as (
        insert into organization(name,country_code,default_currency_code,default_timezone)
        values (${`Hardening Org ${suffix}`},'US','USD','America/Denver')
        returning id
      ),
      au as (
        insert into app_user(auth_subject,email,display_name)
        values (${`hard-admin-${suffix}`},${`hard-admin-${suffix}@example.test`},'Hardening Admin')
        returning id
      ),
      mu as (
        insert into app_user(auth_subject,email,display_name)
        values (${`hard-manager-${suffix}`},${`hard-manager-${suffix}@example.test`},'Hardening Manager')
        returning id
      ),
      uu as (
        insert into app_user(auth_subject,email,display_name)
        values (${`hard-user-${suffix}`},${`hard-user-${suffix}@example.test`},'Hardening User')
        returning id
      ),
      am as (
        insert into organization_membership(organization_id,user_id,role_code)
        select o.id,au.id,'ADMIN'::membership_role from o,au
        returning id,organization_id,user_id
      ),
      mm as (
        insert into organization_membership(organization_id,user_id,role_code)
        select o.id,mu.id,'SITE_MANAGER'::membership_role from o,mu
        returning id,organization_id,user_id
      ),
      um as (
        insert into organization_membership(organization_id,user_id,role_code)
        select o.id,uu.id,'USER'::membership_role from o,uu
        returning id,organization_id,user_id
      ),
      sa as (
        insert into site(organization_id,name,code,timezone,country_code)
        select o.id,'Scoped Site A','HARD-A','America/Denver','US' from o
        returning id,organization_id
      ),
      sb as (
        insert into site(organization_id,name,code,timezone,country_code)
        select o.id,'Unassigned Site B','HARD-B','America/Denver','US' from o
        returning id,organization_id
      )
      select
        o.id as org_id,
        au.id as admin_user, am.id as admin_membership,
        mu.id as manager_user, mm.id as manager_membership,
        uu.id as user_user, um.id as user_membership,
        sa.id as site_a, sb.id as site_b
      from o,au,am,mu,mm,uu,um,sa,sb
    `;
    const r = rows[0];
    ids.org = r.org_id;
    ids.adminUser = r.admin_user;
    ids.adminMembership = r.admin_membership;
    ids.managerUser = r.manager_user;
    ids.managerMembership = r.manager_membership;
    ids.userUser = r.user_user;
    ids.userMembership = r.user_membership;
    ids.siteA = r.site_a;
    ids.siteB = r.site_b;

    await migrator`
      insert into site_membership_scope(organization_id,site_id,membership_id)
      values
        (${ids.org},${ids.siteA},${ids.managerMembership}),
        (${ids.org},${ids.siteA},${ids.userMembership})
    `;

    expect(ids.siteA).toBeTruthy();
    expect(ids.siteB).toBeTruthy();
  });

  it("scopes Site visibility for SITE_MANAGER and USER while ADMIN retains Organization visibility", async () => {
    const adminSites = await asAdmin((tx) => tx`select id from site order by code`);
    const managerSites = await asManager((tx) => tx`select id from site order by code`);
    const userSites = await asUser((tx) => tx`select id from site order by code`);

    expect(adminSites.map((r) => r.id)).toEqual(expect.arrayContaining([ids.siteA, ids.siteB]));
    expect(managerSites.map((r) => r.id)).toEqual([ids.siteA]);
    expect(userSites.map((r) => r.id)).toEqual([ids.siteA]);
  });

  it("preserves assigned historical reads when a Site becomes INACTIVE but blocks new Work Areas", async () => {
    const key = crypto.randomUUID();
    const created = await asManager((tx) => tx`
      select * from app_private.create_work_area_with_qr(
        ${ids.siteA}, 'History Area', 'HISTORY', 'Historical read test', '', ${key}
      )
    `);
    ids.workArea = created[0].work_area_id;
    ids.token = created[0].public_token;

    await migrator`update site set status='INACTIVE' where id=${ids.siteA}`;

    const sites = await asManager((tx) => tx`select id,status from site where id=${ids.siteA}`);
    const areas = await asManager((tx) => tx`select id,status from work_area where id=${ids.workArea}`);
    expect(sites[0].status).toBe("INACTIVE");
    expect(areas[0].id).toBe(ids.workArea);

    await expect(asManager((tx) => tx`
      select * from app_private.create_work_area_with_qr(
        ${ids.siteA}, 'Blocked Area', 'BLOCKED', '', '', ${crypto.randomUUID()}
      )
    `)).rejects.toThrow(/active site access is required/i);

    const publicRows = await runtime`select * from app_private.resolve_public_work_area_qr(${ids.token})`;
    expect(publicRows[0].service_status).toBe("INACTIVE");

    await migrator`update site set status='ACTIVE' where id=${ids.siteA}`;
  });

  it("prevents USER from reading command idempotency payloads", async () => {
    const rows = await asUser((tx) => tx`
      select result_json from operation_idempotency where organization_id=${ids.org}
    `);
    expect(rows).toHaveLength(0);
  });

  it("serializes concurrent Work Area creates with the same idempotency key", async () => {
    const key = crypto.randomUUID();

    const [a, b] = await Promise.all([
      asAdmin((tx) => tx`
        select * from app_private.create_work_area_with_qr(
          ${ids.siteA}, 'Concurrent Area', 'CONCUR-A', '', '', ${key}
        )
      `),
      asAdmin((tx) => tx`
        select * from app_private.create_work_area_with_qr(
          ${ids.siteA}, 'Ignored Concurrent Duplicate', 'CONCUR-B', '', '', ${key}
        )
      `),
    ]);

    expect(a[0].work_area_id).toBe(b[0].work_area_id);
    expect(a[0].qr_id).toBe(b[0].qr_id);
    expect(a[0].public_token).toBe(b[0].public_token);

    const counts = await migrator`
      select
        count(*) filter (where id=${a[0].work_area_id}::uuid) as work_area_count,
        (select count(*) from work_area_qr where work_area_id=${a[0].work_area_id}::uuid and status='ACTIVE') as active_qr_count
      from work_area
      where organization_id=${ids.org}
    `;
    expect(Number(counts[0].work_area_count)).toBe(1);
    expect(Number(counts[0].active_qr_count)).toBe(1);
  });

  it("serializes concurrent QR regeneration with the same idempotency key", async () => {
    const key = crypto.randomUUID();

    const [a, b] = await Promise.all([
      asAdmin((tx) => tx`select * from app_private.regenerate_work_area_qr(${ids.workArea}, ${key})`),
      asAdmin((tx) => tx`select * from app_private.regenerate_work_area_qr(${ids.workArea}, ${key})`),
    ]);

    expect(a[0].qr_id).toBe(b[0].qr_id);
    expect(a[0].public_token).toBe(b[0].public_token);

    const active = await migrator`
      select id,public_token from work_area_qr
      where work_area_id=${ids.workArea} and status='ACTIVE'
    `;
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(a[0].qr_id);
  });
});
