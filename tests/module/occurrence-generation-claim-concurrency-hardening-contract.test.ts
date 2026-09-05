import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";


const migrationPath =
  path.resolve(
    process.cwd(),
    "drizzle/0025_occurrence_generation_claim_concurrency_hardening.sql"
  );


const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );


const claimMarker =
  /create\s+or\s+replace\s+function\s+app_private\.claim_occurrence_generation_schedule\s*\(/i;


const claimMatch =
  claimMarker.exec(sql);


if (!claimMatch) {
  throw new Error(
    "0025 claim function replacement is missing."
  );
}


const claimStart =
  claimMatch.index;


const claimEndCandidate =
  sql
    .toLowerCase()
    .indexOf(
      "revoke all",
      claimStart
    );


const claimSql =
  sql.slice(
    claimStart,
    claimEndCandidate === -1
      ? undefined
      : claimEndCandidate
  );


describe(
  "Occurrence Generation Worker 04A claim concurrency hardening 0025",
  () => {

    it(
      "moves generation-state creation and synchronization to a SECURITY DEFINER Schedule trigger",
      () => {

        expect(sql).toMatch(
          /create\s+or\s+replace\s+function\s+app_private\.sync_schedule_occurrence_generation_state_from_schedule\s*\(\s*\)[\s\S]*returns\s+trigger[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i
        );


        expect(sql).toMatch(
          /create\s+trigger\s+schedule_occurrence_generation_state_sync[\s\S]*after\s+insert[\s\S]*or\s+update\s+of\s+organization_id\s*,\s*site_id[\s\S]*on\s+public\.schedule_master[\s\S]*execute\s+function\s+app_private\.sync_schedule_occurrence_generation_state_from_schedule\s*\(\s*\)/i
        );

      }
    );


    it(
      "backfills every existing Schedule without resetting generation history",
      () => {

        expect(sql).toMatch(
          /insert\s+into\s+public\.schedule_occurrence_generation_state\s*\([\s\S]*schedule_id[\s\S]*organization_id[\s\S]*site_id[\s\S]*next_run_at[\s\S]*updated_at[\s\S]*\)[\s\S]*select[\s\S]*sm\.id[\s\S]*sm\.organization_id[\s\S]*sm\.site_id[\s\S]*from\s+public\.schedule_master\s+sm[\s\S]*on\s+conflict\s*\(\s*schedule_id\s*\)[\s\S]*do\s+update/i
        );


        const backfillStart =
          sql.indexOf(
            "-- 2. One-time backfill / metadata synchronization"
          );

        const backfillEnd =
          sql.indexOf(
            "-- 3. Concurrency-safe worker claim"
          );

        expect(backfillStart).toBeGreaterThan(-1);
        expect(backfillEnd).toBeGreaterThan(
          backfillStart
        );

        const backfillSql =
          sql.slice(
            backfillStart,
            backfillEnd
          );

        expect(backfillSql).not.toMatch(
          /attempt_count\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /last_started_at\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /last_completed_at\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /last_horizon_start\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /last_horizon_end\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /worker_claim_token\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /worker_id\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /worker_lease_until\s*=/i
        );

        expect(backfillSql).not.toMatch(
          /last_error\s*=/i
        );

      }
    );


    it(
      "removes all claim-time generation-state INSERT and UPSERT activity",
      () => {

        expect(claimSql).not.toMatch(
          /insert\s+into\s+public\.schedule_occurrence_generation_state/i
        );


        expect(claimSql).not.toMatch(
          /on\s+conflict\s*\(\s*schedule_id\s*\)/i
        );

      }
    );


    it(
      "retains deterministic FOR UPDATE OF gs SKIP LOCKED acquisition",
      () => {

        expect(claimSql).toMatch(
          /order\s+by\s+gs\.next_run_at\s*,\s*gs\.schedule_id[\s\S]*for\s+update\s+of\s+gs\s+skip\s+locked[\s\S]*limit\s+1/i
        );

      }
    );


    it(
      "retains the 48-hour eligibility-gated rolling horizon",
      () => {

        expect(claimSql).toMatch(
          /v_horizon_start\s*:=\s*date_trunc\s*\(\s*'minute'\s*,\s*now\s*\(\s*\)\s*\)/i
        );


        expect(claimSql).toMatch(
          /v_horizon_end\s*:=\s*v_horizon_start\s*\+\s*interval\s+'48 hours'/i
        );


        expect(claimSql).toMatch(
          /app_private\.schedule_generation_claim_eligible\s*\(\s*gs\.schedule_id\s*,\s*v_horizon_start\s*,\s*v_horizon_end\s*\)/i
        );

      }
    );


    it(
      "synchronizes Schedule organization/site only after the candidate row has been acquired",
      () => {

        const lockIndex =
          claimSql
            .toLowerCase()
            .indexOf(
              "for update of gs"
            );


        const updateIndex =
          claimSql
            .toLowerCase()
            .indexOf(
              "update\n    public.schedule_occurrence_generation_state gs"
            );


        expect(lockIndex).toBeGreaterThan(-1);

        expect(updateIndex).toBeGreaterThan(
          lockIndex
        );


        expect(claimSql).toMatch(
          /update\s+public\.schedule_occurrence_generation_state\s+gs[\s\S]*organization_id\s*=\s*sm\.organization_id[\s\S]*site_id\s*=\s*sm\.site_id[\s\S]*worker_claim_token\s*=\s*v_token[\s\S]*worker_lease_until\s*=\s*v_lease[\s\S]*attempt_count\s*=\s*gs\.attempt_count\s*\+\s*1[\s\S]*from\s+public\.schedule_master\s+sm/i
        );

      }
    );


    it(
      "does not expand the occurrence-worker capability surface",
      () => {

        expect(sql).toMatch(
          /revoke\s+all[\s\S]*sync_schedule_occurrence_generation_state_from_schedule\s*\(\s*\)[\s\S]*from\s+public/i
        );


        expect(sql).not.toMatch(
          /grant\s+execute[\s\S]*sync_schedule_occurrence_generation_state_from_schedule/i
        );


        expect(sql).not.toMatch(
          /grant\s+(select|insert|update|delete)[\s\S]*schedule_occurrence_generation_state/i
        );


        expect(claimSql).toMatch(
          /returns\s+table\s*\(\s*result_schedule_id\s+uuid\s*,\s*result_organization_id\s+uuid\s*,\s*result_site_id\s+uuid\s*,\s*result_claim_token\s+uuid\s*,\s*result_lease_until\s+timestamptz\s*,\s*result_attempt_count\s+bigint/i
        );

      }
    );

  }
);
