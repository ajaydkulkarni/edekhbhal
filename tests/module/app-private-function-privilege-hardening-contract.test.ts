import fs from "node:fs";
import {
  describe,
  expect,
  it
} from "vitest";

const migration=
  fs.readFileSync(
    "drizzle/0023_app_private_function_privilege_hardening.sql",
    "utf8"
  );

const installer=
  fs.readFileSync(
    "scripts/db-apply-app-private-function-hardening-23.mjs",
    "utf8"
  );

const pkg=
  fs.readFileSync(
    "package.json",
    "utf8"
  );


describe(
  "app_private Function Privilege Hardening 0023 contract",
  ()=>{

    it(
      "revokes PUBLIC EXECUTE from every existing app_private function",
      ()=>{

        expect(migration).toMatch(
          /from pg_proc p[\s\S]*n\.nspname\s*=\s*'app_private'/i
        );

        expect(migration).toMatch(
          /revoke execute on function %s from public/i
        );
      }
    );


    it(
      "changes vnext_migrator defaults for future app_private functions",
      ()=>{

        expect(migration).toMatch(
          /alter default privileges[\s\S]*for role vnext_migrator[\s\S]*in schema app_private[\s\S]*revoke execute on functions from public/i
        );
      }
    );


    it(
      "audits all current app_private functions after apply",
      ()=>{

        expect(installer).toContain(
          "PUBLIC EXECUTE AUDIT"
        );

        expect(installer).toContain(
          "has_function_privilege"
        );

        expect(installer).toContain(
          "PUBLIC executable app_private functions: NONE"
        );
      }
    );


    it(
      "verifies the legacy trigger function is denied without removing its trigger",
      ()=>{

        expect(installer).toContain(
          "prevent_organization_name_change()"
        );

        expect(installer).toContain(
          "vnext_evidence_worker"
        );

        expect(installer).toContain(
          "vnext_occurrence_worker"
        );

        expect(installer).toContain(
          "Organization-name immutability trigger: PRESENT"
        );
      }
    );


    it(
      "preserves the explicit Occurrence worker command contract",
      ()=>{

        expect(installer).toContain(
          "claim_occurrence_generation_schedule"
        );

        expect(installer).toContain(
          "complete_occurrence_generation_claim"
        );

        expect(installer).toContain(
          "fail_occurrence_generation_claim"
        );

        expect(installer).toContain(
          "reconcile_schedule_occurrences_additive_internal"
        );
      }
    );


    it(
      "wires the guarded 0023 installer",
      ()=>{

        expect(installer).toContain(
          "MIGRATION_DATABASE_URL"
        );

        expect(installer).toContain(
          "0023_app_private_function_privilege_hardening.sql"
        );

        expect(installer).not.toMatch(
          /create\s+role/i
        );

        expect(installer).not.toMatch(
          /service[_-]?role/i
        );

        expect(pkg).toContain(
          '"db:app-private-functions:harden": "node scripts/db-apply-app-private-function-hardening-23.mjs"'
        );
      }
    );

  }
);
