import fs from "node:fs";
import {
  describe,
  expect,
  it
} from "vitest";

const audit=
  fs.readFileSync(
    "scripts/db-audit-occurrence-worker-capabilities.mjs",
    "utf8"
  );

const pkg=
  fs.readFileSync(
    "package.json",
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A exhaustive capability audit contract",
  ()=>{

    it(
      "locks the worker to exactly three app_private commands",
      ()=>{

        expect(audit).toContain(
          "claim_occurrence_generation_schedule(text,integer)"
        );

        expect(audit).toContain(
          "complete_occurrence_generation_claim(uuid,uuid,text)"
        );

        expect(audit).toContain(
          "fail_occurrence_generation_claim(uuid,uuid,text,text,integer)"
        );

        expect(audit).toContain(
          "Exactly three worker commands: PASS"
        );

        expect(audit).toContain(
          "Unexpected functions"
        );
      }
    );


    it(
      "detects PUBLIC EXECUTE drift in app_private",
      ()=>{

        expect(audit).toContain(
          "'public'"
        );

        expect(audit).toContain(
          "PUBLIC executable app_private functions: NONE"
        );

        expect(audit).toContain(
          "PUBLIC EXECUTE drift detected in app_private."
        );
      }
    );


    it(
      "verifies the capability role remains NOLOGIN and non-BYPASSRLS",
      ()=>{

        expect(audit).toContain(
          "rolcanlogin"
        );

        expect(audit).toContain(
          "rolbypassrls"
        );

        expect(audit).toContain(
          "Capability role safety: PASS"
        );
      }
    );


    it(
      "detects inherited roles and effective sensitive-table privileges",
      ()=>{

        expect(audit).toContain(
          "pg_auth_members"
        );

        expect(audit).toContain(
          "Inherited PostgreSQL roles: NONE"
        );

        expect(audit).toContain(
          "has_table_privilege"
        );

        expect(audit).toContain(
          "schedule_occurrence_generation_state"
        );

        expect(audit).toContain(
          "Effective sensitive-table privileges: NONE"
        );
      }
    );


    it(
      "verifies required schema usage and hardened future defaults",
      ()=>{

        expect(audit).toContain(
          "has_schema_privilege"
        );

        expect(audit).toContain(
          "app_private USAGE"
        );

        expect(audit).toContain(
          "pg_default_acl"
        );

        expect(audit).toContain(
          "Future PUBLIC EXECUTE default"
        );
      }
    );


    it(
      "is wired as a reusable database audit command",
      ()=>{

        expect(audit).toContain(
          "MIGRATION_DATABASE_URL"
        );

        expect(audit).not.toMatch(
          /grant\s+/i
        );

        expect(audit).not.toMatch(
          /revoke\s+/i
        );

        expect(audit).not.toMatch(
          /create\s+role/i
        );

        expect(pkg).toContain(
          '"db:occurrence-worker-role:audit": "node scripts/db-audit-occurrence-worker-capabilities.mjs"'
        );
      }
    );

  }
);
