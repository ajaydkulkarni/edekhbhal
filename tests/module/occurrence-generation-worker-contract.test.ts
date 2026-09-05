import fs from "node:fs";
import {
  describe,
  expect,
  it
} from "vitest";

const migration=
  fs.readFileSync(
    "drizzle/0022_occurrence_generation_worker.sql",
    "utf8"
  );

const installer=
  fs.readFileSync(
    "scripts/db-apply-occurrence-generation-worker-22.mjs",
    "utf8"
  );

const pkg=
  fs.readFileSync(
    "package.json",
    "utf8"
  );


function additiveFunction(){
  const start=
    migration.indexOf(
      "app_private.reconcile_schedule_occurrences_additive_internal"
    );

  const end=
    migration.indexOf(
      "-- ===========================================================================\n" +
      "-- LEASED GLOBAL WORKER CLAIM",
      start
    );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return migration.slice(start,end);
}


describe(
  "Occurrence Rolling-Horizon Generation Worker Foundation 04A contract",
  ()=>{
    it(
      "creates a FORCE-RLS leased generation-state control plane",
      ()=>{
        expect(migration).toMatch(
          /create table if not exists public\.schedule_occurrence_generation_state/i
        );

        expect(migration).toContain(
          "worker_claim_token uuid"
        );

        expect(migration).toContain(
          "worker_lease_until timestamptz"
        );

        expect(migration).toContain(
          "attempt_count bigint not null default 0"
        );

        expect(migration).toContain(
          "next_run_at timestamptz not null default now()"
        );

        expect(migration).toMatch(
          /alter table public\.schedule_occurrence_generation_state[\s\S]*force row level security/i
        );

        expect(migration).toMatch(
          /revoke all[\s\S]*schedule_occurrence_generation_state[\s\S]*vnext_runtime/i
        );
      }
    );


    it(
      "keeps rolling generation additive and never rewrites existing work",
      ()=>{
        const additive=
          additiveFunction();

        expect(additive).toMatch(
          /on conflict\s*\(\s*schedule_id\s*,\s*scheduled_start_utc\s*\)\s*do nothing/i
        );

        expect(additive).not.toMatch(
          /on conflict[\s\S]{0,200}do update/i
        );

        expect(additive).not.toMatch(
          /delete\s+from\s+public\.schedule_occurrence\b/i
        );

        expect(additive).not.toMatch(
          /delete\s+from\s+public\.schedule_occurrence_task\b/i
        );

        expect(additive).not.toMatch(
          /update\s+public\.schedule_occurrence\b/i
        );

        expect(additive).not.toMatch(
          /update\s+public\.schedule_occurrence_task\b/i
        );

        expect(additive).toContain(
          "if v_occurrence_id is not null then"
        );
      }
    );


    it(
      "preserves canonical recurrence, timezone, working-hours, snapshot, and RANDOM evidence rules",
      ()=>{
        const additive=
          additiveFunction();

        expect(additive).toContain(
          "app_private.schedule_candidate_matches"
        );

        expect(additive).toContain(
          "app_private.effective_working_hours"
        );

        expect(additive).toContain(
          "app_private.local_span_fits_working_hours"
        );

        expect(additive).toContain(
          "candidate_local at time zone sm.timezone"
        );

        expect(additive).toContain(
          "roundtrip_local = candidate_local"
        );

        expect(additive).toContain(
          "timezone_snapshot"
        );

        expect(additive).toContain(
          "working_hours_snapshot"
        );

        expect(additive).toContain(
          "schedule_version_snapshot"
        );

        expect(additive).toContain(
          "task_instructions_snapshot"
        );

        expect(additive).toContain(
          "hashtextextended"
        );

        expect(additive).toContain(
          "st.random_every_n"
        );

        expect(additive).toContain(
          "st.random_evidence_type"
        );

        expect(additive).toContain(
          "Occurrence horizon cannot exceed 7 days"
        );
      }
    );


    it(
      "fails closed for inactive Organization, Site, Work Area, or Schedule",
      ()=>{
        const additive=
          additiveFunction();

        expect(additive).toMatch(
          /sm\.status\s*<>\s*'ACTIVE'/i
        );

        expect(additive).toMatch(
          /org_row\.status\s*<>\s*'ACTIVE'/i
        );

        expect(additive).toMatch(
          /site_row\.status\s*<>\s*'ACTIVE'/i
        );

        expect(additive).toMatch(
          /wa\.status\s*<>\s*'ACTIVE'/i
        );

        expect(
          (
            migration.match(
              /join\s+public\.organization\s+o\s+on\s+o\.id\s*=\s*sm\.organization_id/gmi
            ) ?? []
          ).length
        ).toBe(2);

        expect(
          (
            migration.match(
              /where\s+o\.status\s*=\s*'ACTIVE'/gmi
            ) ?? []
          ).length
        ).toBe(2);
      }
    );


    it(
      "uses leased skip-locked claiming and a canonical 48-hour worker horizon",
      ()=>{
        expect(migration).toContain(
          "claim_occurrence_generation_schedule"
        );

        expect(migration).toMatch(
          /for update of gs skip locked/i
        );

        expect(migration).toMatch(
          /worker_lease_until\s+is\s+null[\s\S]*worker_lease_until\s*<=\s*now\(\)/i
        );

        expect(migration).toContain(
          "p_lease_seconds < 15"
        );

        expect(migration).toContain(
          "p_lease_seconds > 300"
        );

        expect(migration).toContain(
          "interval '48 hours'"
        );

        expect(migration).toContain(
          "interval '15 minutes'"
        );

        expect(migration).toContain(
          "attempt_count + 1"
        );
      }
    );


    it(
      "binds completion and retry to the live claim while keeping application runtime denied",
      ()=>{
        expect(migration).toContain(
          "complete_occurrence_generation_claim"
        );

        expect(migration).toContain(
          "fail_occurrence_generation_claim"
        );

        expect(migration).toContain(
          "Occurrence generation claim mismatch"
        );

        expect(
          (
            migration.match(
              /Occurrence generation lease has expired/g
            ) ?? []
          ).length
        ).toBe(2);

        expect(migration).toMatch(
          /revoke all[\s\S]*claim_occurrence_generation_schedule[\s\S]*vnext_runtime/i
        );

        expect(migration).toMatch(
          /revoke all[\s\S]*complete_occurrence_generation_claim[\s\S]*vnext_runtime/i
        );

        expect(migration).toMatch(
          /revoke all[\s\S]*fail_occurrence_generation_claim[\s\S]*vnext_runtime/i
        );
      }
    );


    it(
      "provides a guarded migrator installer without provisioning a worker credential",
      ()=>{
        expect(installer).toContain(
          "MIGRATION_DATABASE_URL"
        );

        expect(installer).toContain(
          "0022_occurrence_generation_worker.sql"
        );

        expect(installer).toContain(
          "relforcerowsecurity"
        );

        expect(installer).toContain(
          "has_function_privilege"
        );

        expect(installer).toContain(
          "Additive existing-Occurrence preservation: PASS"
        );

        expect(installer).not.toMatch(
          /create\s+role/i
        );

        expect(installer).not.toMatch(
          /password/i
        );

        expect(installer).not.toMatch(
          /service[_-]?role/i
        );

        expect(pkg).toContain(
          '"db:occurrence-worker:apply": "node scripts/db-apply-occurrence-generation-worker-22.mjs"'
        );
      }
    );
  }
);
