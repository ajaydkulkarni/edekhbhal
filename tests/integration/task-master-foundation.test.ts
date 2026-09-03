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
  site: "",
  task: "",
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

describe("Task Master Foundation database boundary", () => {
  afterAll(async () => {
    if (ids.org) {
      await migrator`delete from audit_event where organization_id=${ids.org}`;
      await migrator`delete from operation_idempotency where organization_id=${ids.org}`;
      await migrator`delete from task_attachment where organization_id=${ids.org}`;
      await migrator`delete from task_master where organization_id=${ids.org}`;
      await migrator`delete from site_membership_scope where organization_id=${ids.org}`;
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

  it("creates ADMIN, scoped SITE_MANAGER, USER, and Site fixture", async () => {
    const suffix = Date.now().toString();
    const rows = await migrator`
      with o as (
        insert into organization(name,country_code,default_currency_code,default_timezone)
        values (${`Task Org ${suffix}`},'US','USD','America/Denver') returning id
      ),
      au as (
        insert into app_user(auth_subject,email,display_name)
        values (${`task-admin-${suffix}`},${`task-admin-${suffix}@example.test`},'Task Admin') returning id
      ),
      mu as (
        insert into app_user(auth_subject,email,display_name)
        values (${`task-manager-${suffix}`},${`task-manager-${suffix}@example.test`},'Task Manager') returning id
      ),
      uu as (
        insert into app_user(auth_subject,email,display_name)
        values (${`task-user-${suffix}`},${`task-user-${suffix}@example.test`},'Task User') returning id
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
      s as (
        insert into site(organization_id,name,code,timezone,country_code)
        select o.id,'Task Site','TASK-SITE','America/Denver','US' from o
        returning id,organization_id
      )
      select
        o.id as org_id,
        au.id as admin_user, am.id as admin_membership,
        mu.id as manager_user, mm.id as manager_membership,
        uu.id as user_user, um.id as user_membership,
        s.id as site_id
      from o,au,am,mu,mm,uu,um,s
    `;
    const r = rows[0];
    ids.org = r.org_id;
    ids.adminUser = r.admin_user;
    ids.adminMembership = r.admin_membership;
    ids.managerUser = r.manager_user;
    ids.managerMembership = r.manager_membership;
    ids.userUser = r.user_user;
    ids.userMembership = r.user_membership;
    ids.site = r.site_id;

    await migrator`
      insert into site_membership_scope(organization_id,site_id,membership_id)
      values (${ids.org},${ids.site},${ids.managerMembership})
    `;
    expect(ids.site).toBeTruthy();
  });

  it("creates a Task idempotently and stores rich HTML source", async () => {
    const key = crypto.randomUUID();
    const first = await asAdmin((tx) => tx<{ create_task_master: string }[]>`
      select app_private.create_task_master(
        'Clean entrance glass',
        '<p>Clean <strong>both sides</strong>.</p>',
        ${key}
      )
    `);
    const second = await asAdmin((tx) => tx<{ create_task_master: string }[]>`
      select app_private.create_task_master(
        'Ignored duplicate',
        '<p>Ignored</p>',
        ${key}
      )
    `);

    ids.task = first[0].create_task_master;
    expect(second[0].create_task_master).toBe(ids.task);

    const rows = await asAdmin((tx) => tx`
      select name,instructions_html,status,version
      from task_master where id=${ids.task}
    `);
    expect(rows[0]).toMatchObject({
      name: "Clean entrance glass",
      instructions_html: "<p>Clean <strong>both sides</strong>.</p>",
      status: "ACTIVE",
    });
    expect(Number(rows[0].version)).toBe(1);
  });

  it("allows scoped SITE_MANAGER management and USER read-only access", async () => {
    const managerAllowed = await asManager((tx) => tx<{ allowed: boolean }[]>`
      select app_private.can_manage_tasks() as allowed
    `);
    const userAllowed = await asUser((tx) => tx<{ allowed: boolean }[]>`
      select app_private.can_manage_tasks() as allowed
    `);
    expect(managerAllowed[0].allowed).toBe(true);
    expect(userAllowed[0].allowed).toBe(false);

    const visible = await asUser((tx) => tx`select id,name from task_master where id=${ids.task}`);
    expect(visible[0].id).toBe(ids.task);

    await expect(asUser((tx) => tx`
      update task_master
      set name='Forbidden'
      where id=${ids.task}
      returning id
    `)).rejects.toThrow(/permission denied/i);

    const unchanged = await asAdmin((tx) => tx<{ name: string }[]>`
      select name from task_master where id=${ids.task}
    `);
    expect(unchanged[0].name).toBe("Clean entrance glass");
  });

  it("updates with optimistic versioning and audits old/new values", async () => {
    const before = await asManager((tx) => tx<{ version: number }[]>`
      select version from task_master where id=${ids.task}
    `);

    await asManager((tx) => tx`
      select app_private.update_task_master(
        ${ids.task},
        'Clean lobby entrance glass',
        '<p>Clean both sides and <em>inspect corners</em>.</p>',
        ${before[0].version}
      )
    `);

    await expect(asManager((tx) => tx`
      select app_private.update_task_master(
        ${ids.task},
        'Stale edit',
        '',
        ${before[0].version}
      )
    `)).rejects.toThrow(/changed by another user/i);

    const audit = await migrator`
      select old_value_json,new_value_json
      from audit_event
      where organization_id=${ids.org}
        and action_code='TASK_UPDATED'
      order by timestamp_utc desc
      limit 1
    `;
    expect(audit[0].old_value_json.name).toBe("Clean entrance glass");
    expect(audit[0].new_value_json.name).toBe("Clean lobby entrance glass");
    expect(audit[0].old_value_json.instructionsHtml).toContain("both sides");
    expect(audit[0].new_value_json.instructionsHtml).toContain("inspect corners");
  });

  it("uses soft ACTIVE/INACTIVE lifecycle with change-of-value audit", async () => {
    const before = await asAdmin((tx) => tx<{ version: number }[]>`
      select version from task_master where id=${ids.task}
    `);
    await asAdmin((tx) => tx`
      select app_private.set_task_master_status(
        ${ids.task},
        'INACTIVE'::record_status,
        ${before[0].version}
      )
    `);

    const now = await asUser((tx) => tx`select status from task_master where id=${ids.task}`);
    expect(now[0].status).toBe("INACTIVE");

    const audit = await migrator`
      select old_value_json,new_value_json
      from audit_event
      where organization_id=${ids.org}
        and action_code='TASK_STATUS_CHANGED'
      order by timestamp_utc desc
      limit 1
    `;
    expect(audit[0].old_value_json.status).toBe("ACTIVE");
    expect(audit[0].new_value_json.status).toBe("INACTIVE");
  });

  it("prepares attachment metadata for object storage without Base64 content columns", async () => {
    const columns = await migrator`
      select column_name
      from information_schema.columns
      where table_schema='public' and table_name='task_attachment'
      order by ordinal_position
    `;
    const names = columns.map((r) => r.column_name);
    expect(names).toEqual(expect.arrayContaining([
      "organization_id",
      "task_id",
      "storage_provider",
      "storage_bucket",
      "storage_key",
      "original_filename",
      "media_type",
      "byte_size",
      "sha256_hex",
    ]));
    expect(names.some((name) => /base64|blob|content/i.test(name))).toBe(false);
  });

  it("fails closed without tenant context", async () => {
    const rows = await runtime`select id from task_master where id=${ids.task}`;
    expect(rows).toHaveLength(0);
  });

  it("records Task creation, edit, and lifecycle audit actions", async () => {
    const rows = await migrator`
      select action_code
      from audit_event
      where organization_id=${ids.org}
        and module_code='TASK'
      order by timestamp_utc,id
    `;
    const actions = rows.map((r) => r.action_code);
    expect(actions).toContain("TASK_CREATED");
    expect(actions).toContain("TASK_UPDATED");
    expect(actions).toContain("TASK_STATUS_CHANGED");
  });
});
