import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!runtimeUrl || !migrationUrl) throw new Error("Database URLs are required.");

const runtime = postgres(runtimeUrl, { max: 4, prepare: false, ssl: "require" });
const migrator = postgres(migrationUrl, { max: 1, prepare: false, ssl: "require" });

const ids = {
  org: "",
  user: "",
  membership: "",
  site: "",
  workArea: "",
  qr: "",
  token: "",
};

async function asContext<T>(fn: (tx: postgres.TransactionSql<{}>) => Promise<T>) {
  const result = await runtime.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${ids.user}, true)`;
    await tx`select set_config('app.organization_id', ${ids.org}, true)`;
    await tx`select set_config('app.membership_id', ${ids.membership}, true)`;
    return fn(tx);
  });
  return result as T;
}

describe("Work Area + QR lifecycle database boundary", () => {
  afterAll(async () => {
    if (ids.org) {
      await migrator`delete from audit_event where organization_id = ${ids.org}`;
      await migrator`delete from operation_idempotency where organization_id = ${ids.org}`;
      await migrator`delete from work_area_qr where organization_id = ${ids.org}`;
      await migrator`delete from work_area where organization_id = ${ids.org}`;
      await migrator`delete from site_membership_scope where organization_id = ${ids.org}`;
      await migrator`delete from organization_subscription where organization_id = ${ids.org}`;
      await migrator`delete from organization_membership where organization_id = ${ids.org}`;
      await migrator`delete from site where organization_id = ${ids.org}`;
      await migrator`delete from organization where id = ${ids.org}`;
    }
    if (ids.user) await migrator`delete from app_user where id = ${ids.user}`;
    await runtime.end({ timeout: 5 });
    await migrator.end({ timeout: 5 });
  });

  it("creates isolated ADMIN fixture", async () => {
    const rows = await migrator`
      with o as (
        insert into organization(name,country_code,default_currency_code,default_timezone)
        values ('QR Integration Org','US','USD','America/Denver') returning id
      ), u as (
        insert into app_user(auth_subject,email,display_name)
        values (${`wa-${Date.now()}@example.test`},'wa@example.test','WA Integration Admin') returning id
      ), m as (
        insert into organization_membership(organization_id,user_id,role_code)
        select o.id,u.id,'ADMIN'::membership_role from o,u returning id,organization_id,user_id
      ), s as (
        insert into site(organization_id,name,code,timezone,country_code)
        select m.organization_id,'Integration Site','INT01','America/Denver','US' from m returning id,organization_id
      )
      select m.organization_id as org_id,m.user_id,m.id as membership_id,s.id as site_id
      from m,s
    `;
    ids.org = rows[0].org_id;
    ids.user = rows[0].user_id;
    ids.membership = rows[0].membership_id;
    ids.site = rows[0].site_id;
    expect(ids.site).toBeTruthy();
  });

  it("creates a Work Area and one active QR idempotently", async () => {
    const key = crypto.randomUUID();
    const first = await asContext((tx) => tx`
      select * from app_private.create_work_area_with_qr(
        ${ids.site}, 'Main Lobby', 'LOBBY', 'Entry service area', 'North door', ${key}
      )
    `);
    const second = await asContext((tx) => tx`
      select * from app_private.create_work_area_with_qr(
        ${ids.site}, 'Ignored Duplicate', 'OTHER', '', '', ${key}
      )
    `);
    ids.workArea = first[0].work_area_id;
    ids.qr = first[0].qr_id;
    ids.token = first[0].public_token;
    expect(second[0].work_area_id).toBe(ids.workArea);
    expect(second[0].public_token).toBe(ids.token);

    const qrs = await migrator`select * from work_area_qr where work_area_id = ${ids.workArea} and status='ACTIVE'`;
    expect(qrs).toHaveLength(1);
  });

  it("reprint semantics keep the same active identity", async () => {
    const rows = await asContext((tx) => tx`
      select id, public_token from work_area_qr
      where work_area_id=${ids.workArea} and status='ACTIVE'
    `);
    expect(rows[0].id).toBe(ids.qr);
    expect(rows[0].public_token).toBe(ids.token);
  });

  it("regenerates atomically and makes the old public QR invalid", async () => {
    const key = crypto.randomUUID();
    const regenerated = await asContext((tx) => tx`
      select * from app_private.regenerate_work_area_qr(${ids.workArea}, ${key})
    `);
    expect(regenerated[0].public_token).not.toBe(ids.token);

    const oldResolve = await runtime`select * from app_private.resolve_public_work_area_qr(${ids.token})`;
    const newResolve = await runtime`select * from app_private.resolve_public_work_area_qr(${regenerated[0].public_token})`;
    expect(oldResolve).toHaveLength(0);
    expect(newResolve[0].work_area_name).toBe("Main Lobby");

    const repeat = await asContext((tx) => tx`
      select * from app_private.regenerate_work_area_qr(${ids.workArea}, ${key})
    `);
    expect(repeat[0].qr_id).toBe(regenerated[0].qr_id);
    ids.qr = regenerated[0].qr_id;
    ids.token = regenerated[0].public_token;
  });

  it("uses optimistic versioning for Work Area status changes", async () => {
    const before = await asContext((tx) => tx`select version,status from work_area where id=${ids.workArea}`);
    await asContext((tx) => tx`
      select app_private.set_work_area_status(${ids.workArea}, 'INACTIVE'::record_status, ${before[0].version})
    `);
    await expect(asContext((tx) => tx`
      select app_private.set_work_area_status(${ids.workArea}, 'ACTIVE'::record_status, ${before[0].version})
    `)).rejects.toThrow(/changed by another user/i);

    const now = await asContext((tx) => tx`select version,status from work_area where id=${ids.workArea}`);
    await asContext((tx) => tx`
      select app_private.set_work_area_status(${ids.workArea}, 'ACTIVE'::record_status, ${now[0].version})
    `);
  });

  it("fails closed without tenant context while public resolver exposes only safe fields", async () => {
    const hidden = await runtime`select id from work_area where id=${ids.workArea}`;
    expect(hidden).toHaveLength(0);

    const publicRows = await runtime`select * from app_private.resolve_public_work_area_qr(${ids.token})`;
    expect(publicRows[0]).toMatchObject({
      organization_name: "QR Integration Org",
      site_name: "Integration Site",
      work_area_name: "Main Lobby",
      service_status: "ACTIVE",
    });
    expect(Object.keys(publicRows[0]).sort()).toEqual([
      "location_details",
      "organization_name",
      "service_status",
      "site_name",
      "work_area_description",
      "work_area_name",
    ].sort());
  });

  it("records creation, issue, regeneration, and status-change audit evidence", async () => {
    const rows = await migrator`
      select action_code from audit_event
      where organization_id=${ids.org}
      order by timestamp_utc,id
    `;
    const actions = rows.map((r) => r.action_code);
    expect(actions).toContain("WORK_AREA_CREATED");
    expect(actions).toContain("QR_ISSUED");
    expect(actions).toContain("QR_REGENERATED");
    expect(actions.filter((v) => v === "WORK_AREA_STATUS_CHANGED").length).toBe(2);
  });
});
