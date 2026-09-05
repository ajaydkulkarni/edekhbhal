import fs from "node:fs";
import {
  describe,
  expect,
  it
} from "vitest";

const privileged=
  fs.readFileSync(
    "supabase-privileged/003_occurrence_worker_capability_role.sql",
    "utf8"
  );

const grants=
  fs.readFileSync(
    "scripts/db-apply-occurrence-worker-capability-grants.mjs",
    "utf8"
  );

const pkg=
  fs.readFileSync(
    "package.json",
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A capability-role contract",
  ()=>{

    it(
      "defines a dedicated NOLOGIN non-BYPASSRLS capability role",
      ()=>{

        expect(privileged).toMatch(
          /create role vnext_occurrence_worker[\s\S]*nologin/i
        );

        expect(privileged).toMatch(
          /nosuperuser/i
        );

        expect(privileged).toMatch(
          /nocreatedb/i
        );

        expect(privileged).toMatch(
          /nocreaterole/i
        );

        expect(privileged).toMatch(
          /noreplication/i
        );

        expect(privileged).toMatch(
          /nobypassrls/i
        );

        expect(privileged).not.toMatch(
          /\bpassword\b\s+['"]/i
        );
      }
    );


    it(
      "grants only the three claim-bound worker commands",
      ()=>{

        expect(grants).toMatch(
          /grant execute[\s\S]*claim_occurrence_generation_schedule/i
        );

        expect(grants).toMatch(
          /grant execute[\s\S]*complete_occurrence_generation_claim/i
        );

        expect(grants).toMatch(
          /grant execute[\s\S]*fail_occurrence_generation_claim/i
        );

        expect(grants).toMatch(
          /revoke execute[\s\S]*reconcile_schedule_occurrences_additive_internal/i
        );

        expect(grants).toMatch(
          /revoke execute[\s\S]*reconcile_schedule_occurrences\(/i
        );
      }
    );


    it(
      "keeps the capability role separate from application and Evidence worker roles",
      ()=>{

        expect(grants).toContain(
          "'vnext_runtime'"
        );

        expect(grants).toContain(
          "'vnext_evidence_worker'"
        );

        expect(grants).toContain(
          "runtime_member"
        );

        expect(grants).toContain(
          "evidence_worker_member"
        );
      }
    );


    it(
      "verifies there are no direct sensitive-table privileges",
      ()=>{

        expect(grants).toContain(
          "information_schema.role_table_grants"
        );

        expect(grants).toContain(
          "schedule_occurrence_generation_state"
        );

        expect(grants).toContain(
          "schedule_master"
        );

        expect(grants).toContain(
          "schedule_occurrence"
        );

        expect(grants).toContain(
          "schedule_occurrence_task"
        );

        expect(grants).toContain(
          "Direct sensitive-table privileges: NONE"
        );

        expect(grants).not.toMatch(
          /grant\s+(select|insert|update|delete)\b/i
        );
      }
    );


    it(
      "does not introduce a service credential or migration-role worker",
      ()=>{

        expect(grants).toContain(
          "MIGRATION_DATABASE_URL"
        );

        expect(grants).not.toMatch(
          /service[_-]?role/i
        );

        expect(grants).not.toMatch(
          /create\s+role/i
        );

        expect(pkg).toContain(
          '"db:occurrence-worker-role:grant": "node scripts/db-apply-occurrence-worker-capability-grants.mjs"'
        );
      }
    );

  }
);
