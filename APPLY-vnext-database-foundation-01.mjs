import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const required = ["package.json", "vitest.config.ts", "src/db/schema.ts"];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required file: ${file}`);
}

const files = new Map();

files.set("drizzle/0001_rls_foundation.sql", `-- vNext Database Foundation 01
-- RLS-native core tenancy / audit / outbox foundation.

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to vnext_runtime;

do $$ begin
  create type membership_role as enum ('ADMIN','SITE_MANAGER','USER');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type record_status as enum ('ACTIVE','INACTIVE');
exception when duplicate_object then null;
end $$;

create table if not exists organization (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null,
  default_currency_code text not null,
  default_timezone text not null,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null unique,
  email text,
  display_name text,
  preferred_language text not null default 'en',
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_membership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  user_id uuid not null references app_user(id),
  role_code membership_role not null,
  status record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint organization_membership_org_user_uq unique (organization_id, user_id)
);

create index if not exists organization_membership_user_idx
  on organization_membership(user_id);
create index if not exists organization_membership_org_idx
  on organization_membership(organization_id);

create table if not exists audit_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organization(id),
  timestamp_utc timestamptz not null default now(),
  actor_user_id uuid references app_user(id),
  actor_membership_id uuid references organization_membership(id),
  actor_display_name_snapshot text,
  ip_address text,
  module_code text not null,
  action_code text not null,
  entity_type text not null,
  entity_id text not null,
  old_value_json jsonb,
  new_value_json jsonb,
  request_id text,
  correlation_id text,
  source_channel text not null,
  reason text
);

create index if not exists audit_event_org_time_idx
  on audit_event(organization_id, timestamp_utc);
create index if not exists audit_event_entity_idx
  on audit_event(entity_type, entity_id);

create table if not exists outbox_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organization(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload_json jsonb not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count bigint not null default 0,
  last_error text
);

create index if not exists outbox_event_pending_idx
  on outbox_event(processed_at, available_at);

-- Organization name is immutable.
create or replace function app_private.prevent_organization_name_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.name is distinct from old.name then
    raise exception 'organization name is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_name_immutable on organization;
create trigger organization_name_immutable
before update on organization
for each row execute function app_private.prevent_organization_name_change();

-- Safe readers for transaction-local request context.
create or replace function app_private.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.organization_id', true), '')::uuid
$$;

create or replace function app_private.current_membership_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.membership_id', true), '')::uuid
$$;

-- SECURITY DEFINER helper avoids recursive RLS on organization_membership.
create or replace function app_private.has_active_context(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.organization_membership m
    join public.app_user u on u.id = m.user_id
    join public.organization o on o.id = m.organization_id
    where m.id = app_private.current_membership_id()
      and m.user_id = app_private.current_user_id()
      and m.organization_id = target_organization_id
      and m.organization_id = app_private.current_organization_id()
      and m.status = 'ACTIVE'
      and u.status = 'ACTIVE'
      and o.status = 'ACTIVE'
  )
$$;

create or replace function app_private.current_role()
returns membership_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.role_code
  from public.organization_membership m
  where m.id = app_private.current_membership_id()
    and m.user_id = app_private.current_user_id()
    and m.organization_id = app_private.current_organization_id()
    and m.status = 'ACTIVE'
    and app_private.has_active_context(m.organization_id)
  limit 1
$$;

revoke all on function app_private.current_user_id() from public;
revoke all on function app_private.current_organization_id() from public;
revoke all on function app_private.current_membership_id() from public;
revoke all on function app_private.has_active_context(uuid) from public;
revoke all on function app_private.current_role() from public;

grant execute on function app_private.current_user_id() to vnext_runtime;
grant execute on function app_private.current_organization_id() to vnext_runtime;
grant execute on function app_private.current_membership_id() to vnext_runtime;
grant execute on function app_private.has_active_context(uuid) to vnext_runtime;
grant execute on function app_private.current_role() to vnext_runtime;

-- Explicit runtime grants. RLS remains the row-level boundary.
revoke all on organization, app_user, organization_membership, audit_event, outbox_event
  from public, anon, authenticated;

grant select, update on organization to vnext_runtime;
grant select, update on app_user to vnext_runtime;
grant select, insert, update on organization_membership to vnext_runtime;
grant select, insert on audit_event to vnext_runtime;
grant insert on outbox_event to vnext_runtime;

alter table organization enable row level security;
alter table organization force row level security;
alter table app_user enable row level security;
alter table app_user force row level security;
alter table organization_membership enable row level security;
alter table organization_membership force row level security;
alter table audit_event enable row level security;
alter table audit_event force row level security;
alter table outbox_event enable row level security;
alter table outbox_event force row level security;

drop policy if exists organization_select on organization;
create policy organization_select on organization
for select to vnext_runtime
using (
  id = app_private.current_organization_id()
  and app_private.has_active_context(id)
);

drop policy if exists organization_update on organization;
create policy organization_update on organization
for update to vnext_runtime
using (
  id = app_private.current_organization_id()
  and app_private.has_active_context(id)
  and app_private.current_role() = 'ADMIN'
)
with check (
  id = app_private.current_organization_id()
  and app_private.has_active_context(id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists app_user_select on app_user;
create policy app_user_select on app_user
for select to vnext_runtime
using (
  id = app_private.current_user_id()
  and app_private.has_active_context(app_private.current_organization_id())
);

drop policy if exists app_user_update on app_user;
create policy app_user_update on app_user
for update to vnext_runtime
using (
  id = app_private.current_user_id()
  and app_private.has_active_context(app_private.current_organization_id())
)
with check (
  id = app_private.current_user_id()
  and app_private.has_active_context(app_private.current_organization_id())
);

drop policy if exists membership_select on organization_membership;
create policy membership_select on organization_membership
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and (
    app_private.current_role() = 'ADMIN'
    or id = app_private.current_membership_id()
  )
);

drop policy if exists membership_insert on organization_membership;
create policy membership_insert on organization_membership
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists membership_update on organization_membership;
create policy membership_update on organization_membership
for update to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists audit_select on audit_event;
create policy audit_select on audit_event
for select to vnext_runtime
using (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
  and app_private.current_role() = 'ADMIN'
);

drop policy if exists audit_insert on audit_event;
create policy audit_insert on audit_event
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and actor_user_id = app_private.current_user_id()
  and actor_membership_id = app_private.current_membership_id()
  and app_private.has_active_context(organization_id)
);

drop policy if exists outbox_insert on outbox_event;
create policy outbox_insert on outbox_event
for insert to vnext_runtime
with check (
  organization_id = app_private.current_organization_id()
  and app_private.has_active_context(organization_id)
);

-- Audit is append-only for normal runtime. No UPDATE/DELETE grants or policies.
`);

files.set("scripts/db-apply-foundation-01.mjs", `import fs from "node:fs";
import postgres from "postgres";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is missing.");

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: "require",
});

try {
  const migration = fs.readFileSync("drizzle/0001_rls_foundation.sql", "utf8");
  await sql.unsafe(migration);
  console.log("Database Foundation 01 migration applied successfully.");
} finally {
  await sql.end({ timeout: 5 });
}
`);

files.set("scripts/db-seed-foundation-01.mjs", `import fs from "node:fs";
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
`);

files.set("tests/setup-env.ts", `import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
`);

files.set("tests/integration/rls-foundation.test.ts", `import postgres from "postgres";
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
  return runtime.begin(async (tx) => {
    await tx\`select set_config('app.organization_id', \${organizationId}, true)\`;
    await tx\`select set_config('app.user_id', \${userId}, true)\`;
    await tx\`select set_config('app.membership_id', \${membershipId}, true)\`;
    return fn(tx);
  });
}

describe("RLS Foundation 01", () => {
  beforeAll(async () => {
    const rows = await migrator\`select count(*)::int as count from organization\`;
    expect(rows[0].count).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    await runtime.end({ timeout: 5 });
    await migrator.end({ timeout: 5 });
  });

  it("isolates Organization A", async () => {
    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx\`select id, name from organization order by id\`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids.orgA);
  });

  it("allows the same User to switch independently to Organization B", async () => {
    const rows = await withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
      tx\`select id, name from organization order by id\`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids.orgB);
  });

  it("fails closed when membership and Organization are mismatched", async () => {
    const rows = await withContext(ids.orgB, ids.userShared, ids.memberA, (tx) =>
      tx\`select id from organization\`,
    );
    expect(rows).toHaveLength(0);
  });

  it("clears transaction-local tenant context after commit", async () => {
    await withContext(ids.orgA, ids.userShared, ids.memberA, async (tx) => {
      const inside = await tx\`select id from organization\`;
      expect(inside).toHaveLength(1);
    });

    const outside = await runtime\`select id from organization\`;
    expect(outside).toHaveLength(0);
  });

  it("keeps concurrent Organization contexts isolated", async () => {
    const [a, b] = await Promise.all([
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx\`select id from organization\`,
      ),
      withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
        tx\`select id from organization\`,
      ),
    ]);

    expect(a.map((r) => r.id)).toEqual([ids.orgA]);
    expect(b.map((r) => r.id)).toEqual([ids.orgB]);
  });

  it("lets an ADMIN see memberships in only the active Organization", async () => {
    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx\`select id, organization_id, user_id from organization_membership order by id\`,
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.organization_id === ids.orgA)).toBe(true);
  });

  it("lets a non-admin see only their own membership", async () => {
    const rows = await withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
      tx\`select id from organization_membership order by id\`,
    );

    expect(rows.map((r) => r.id)).toEqual([ids.memberB]);
  });

  it("enforces immutable Organization name even for ADMIN", async () => {
    await expect(
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx\`update organization set name = 'Changed Name' where id = \${ids.orgA}\`,
      ),
    ).rejects.toThrow(/organization name is immutable/i);
  });

  it("allows ADMIN to update permitted Organization fields", async () => {
    await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx\`update organization set default_currency_code = 'USD', version = version + 1 where id = \${ids.orgA}\`,
    );

    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx\`select default_currency_code from organization where id = \${ids.orgA}\`,
    );

    expect(rows[0].default_currency_code).toBe("USD");
  });

  it("prevents USER role from updating Organization", async () => {
    const result = await withContext(ids.orgB, ids.userShared, ids.memberB, (tx) =>
      tx\`update organization set default_currency_code = 'USD' where id = \${ids.orgB} returning id\`,
    );
    expect(result).toHaveLength(0);
  });

  it("accepts an audit event only for the active actor context", async () => {
    const auditId = "40000000-0000-4000-8000-000000000001";

    await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx\`
        insert into audit_event (
          id, organization_id, actor_user_id, actor_membership_id,
          actor_display_name_snapshot, ip_address, module_code, action_code,
          entity_type, entity_id, old_value_json, new_value_json, source_channel
        )
        values (
          \${auditId}, \${ids.orgA}, \${ids.userShared}, \${ids.memberA},
          'Shared Test User', '127.0.0.1', 'ORGANIZATION', 'UPDATE',
          'Organization', \${ids.orgA},
          '{"defaultCurrencyCode":"USD"}'::jsonb,
          '{"defaultCurrencyCode":"USD"}'::jsonb,
          'API'
        )
        on conflict (id) do nothing
      \`,
    );

    const rows = await withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
      tx\`select id, module_code, action_code from audit_event where id = \${auditId}\`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].module_code).toBe("ORGANIZATION");
  });

  it("keeps Audit append-only for runtime", async () => {
    await expect(
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx\`delete from audit_event where organization_id = \${ids.orgA}\`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("prevents a mismatched actor from writing an audit event", async () => {
    await expect(
      withContext(ids.orgA, ids.userShared, ids.memberA, (tx) =>
        tx\`
          insert into audit_event (
            organization_id, actor_user_id, actor_membership_id,
            module_code, action_code, entity_type, entity_id, source_channel
          )
          values (
            \${ids.orgA}, \${ids.userShared}, \${ids.memberOtherA},
            'SECURITY', 'INVALID', 'Organization', \${ids.orgA}, 'API'
          )
        \`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
`);

files.set("docs/DATABASE-FOUNDATION-01.md", `# Database Foundation 01

This increment establishes the first production-style RLS boundary for vNext.

## Scope

- Organization
- global App User
- Organization Membership
- Audit Event
- Outbox Event
- immutable Organization name
- transaction-local user / Organization / membership context
- SECURITY DEFINER membership-context helper
- FORCE RLS
- explicit runtime grants
- deterministic multi-Organization test data
- positive and negative RLS integration tests
- concurrent-context isolation test
- Audit append-only test

The same global User is intentionally seeded into two Organizations with different roles to validate multi-Organization switching.
`);

const packagePath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts["db:foundation:apply"] = "node scripts/db-apply-foundation-01.mjs";
pkg.scripts["db:foundation:seed"] = "node scripts/db-seed-foundation-01.mjs";
pkg.scripts["db:foundation"] = "npm run db:foundation:apply && npm run db:foundation:seed";
pkg.scripts["test:integration"] = "vitest run tests/integration";
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const vitestPath = path.join(root, "vitest.config.ts");
const vitest = `import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
`;
fs.writeFileSync(vitestPath, vitest, "utf8");

for (const [rel, content] of files) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

console.log(`Database Foundation 01 wrote ${files.size} files and updated package.json/vitest.config.ts.`);
console.log("Next: npm run db:foundation");
