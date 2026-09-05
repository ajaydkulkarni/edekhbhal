import fs from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";


const migration =
  fs.readFileSync(
    "drizzle/0024_occurrence_generation_claim_eligibility.sql",
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A claim eligibility 0024",
  () => {

    it(
      "adds an internal SECURITY DEFINER eligibility helper with fixed search_path",
      () => {

        expect(migration).toContain(
          "schedule_generation_claim_eligible"
        );

        expect(migration).toMatch(
          /schedule_generation_claim_eligible[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/i
        );
      }
    );


    it(
      "fails closed for zero-task Schedules",
      () => {

        expect(migration).toMatch(
          /sum\(planned_duration_minutes\)/i
        );

        expect(migration).toMatch(
          /if total_minutes <= 0 then[\s\S]*return false/i
        );
      }
    );


    it(
      "fails closed for malformed recurring planning",
      () => {

        expect(migration).toContain(
          "sm.frequency_type = 'RECURRING'"
        );

        expect(migration).toContain(
          "sm.recurrence_interval <= 0"
        );

        expect(migration).toContain(
          "sm.recurrence_unit = 'WEEK'"
        );

        expect(migration).toContain(
          "sm.recurrence_unit = 'MONTH'"
        );

        expect(migration).toContain(
          "jsonb_array_length"
        );
      }
    );


    it(
      "uses the canonical recurrence predicate for both ONE_TIME and recurring schedules",
      () => {

        expect(migration).toContain(
          "schedule_candidate_matches"
        );

        expect(migration).toContain(
          "sm.frequency_type <> 'ONE_TIME'"
        );

        expect(migration).toMatch(
          /while candidate_local <=[\s\S]*schedule_candidate_matches/i
        );
      }
    );


    it(
      "mirrors the additive two-hour candidate scan and 48-hour claim horizon",
      () => {

        expect(migration).toMatch(
          /p_horizon_start[\s\S]*- interval '2 hours'/i
        );

        expect(migration).toMatch(
          /p_horizon_end[\s\S]*\+ interval '2 hours'/i
        );

        expect(migration).toContain(
          "interval '48 hours'"
        );
      }
    );


    it(
      "enforces DST roundtrip, UTC horizon, and working-hours fit",
      () => {

        expect(migration).toContain(
          "roundtrip_local"
        );

        expect(migration).toMatch(
          /roundtrip_local =[\s\S]*candidate_local/i
        );

        expect(migration).toMatch(
          /candidate_utc >=[\s\S]*p_horizon_start/i
        );

        expect(migration).toMatch(
          /candidate_utc <[\s\S]*p_horizon_end/i
        );

        expect(migration).toContain(
          "local_span_fits_working_hours"
        );
      }
    );


    it(
      "requires at least one not-yet-materialized canonical occurrence",
      () => {

        expect(migration).toMatch(
          /if not exists \([\s\S]*public\.schedule_occurrence/i
        );

        expect(migration).toMatch(
          /so\.schedule_id[\s\S]*sm\.id/i
        );

        expect(migration).toMatch(
          /so\.scheduled_start_utc[\s\S]*candidate_utc/i
        );

        expect(migration).toMatch(
          /if not exists \([\s\S]*return true/i
        );

        expect(migration).toContain(
          "No additive work exists inside this rolling horizon."
        );
      }
    );


    it(
      "uses eligibility before SKIP LOCKED in canonical claim selection",
      () => {

        const helperCall =
          migration.lastIndexOf(
            "app_private.schedule_generation_claim_eligible("
          );

        const skipLocked =
          migration.lastIndexOf(
            "skip locked"
          );

        expect(
          helperCall
        ).toBeGreaterThanOrEqual(0);

        expect(
          skipLocked
        ).toBeGreaterThan(
          helperCall
        );

        expect(migration).toContain(
          "limit 1"
        );
      }
    );


    it(
      "keeps the helper outside the Occurrence worker capability surface",
      () => {

        expect(migration).toMatch(
          /schedule_generation_claim_eligible[\s\S]*from vnext_occurrence_worker;/i
        );

        expect(migration).toMatch(
          /schedule_generation_claim_eligible[\s\S]*from vnext_occurrence_worker_login;/i
        );

        expect(migration).not.toMatch(
          /grant\s+execute[\s\S]*schedule_generation_claim_eligible/i
        );
      }
    );


    it(
      "preserves the existing claim signature and lease contract",
      () => {

        expect(migration).toMatch(
          /claim_occurrence_generation_schedule\(\s*p_worker_id text,\s*p_lease_seconds integer default 120\s*\)/i
        );

        expect(migration).toContain(
          "p_lease_seconds < 15"
        );

        expect(migration).toContain(
          "p_lease_seconds > 300"
        );

        expect(migration).toContain(
          "picked.attempt_count + 1"
        );
      }
    );

  }
);
