import fs from "node:fs";
import {
  describe,
  expect,
  it
} from "vitest";

const transport=
  fs.readFileSync(
    "worker/lib/occurrence-generation-transport.mjs",
    "utf8"
  );

const entry=
  fs.readFileSync(
    "worker/occurrence-generation-worker.mjs",
    "utf8"
  );

const pkg=
  fs.readFileSync(
    "package.json",
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A transport contract",
  ()=>{

    it(
      "loads only the dedicated Occurrence worker credential",
      ()=>{

        expect(transport).toContain(
          ".env.occurrence-worker.local"
        );

        expect(transport).toContain(
          "OCCURRENCE_WORKER_DATABASE_URL"
        );

        expect(transport).toContain(
          "OCCURRENCE_WORKER_ID"
        );

        expect(transport).not.toMatch(
          /process\.env\.MIGRATION_DATABASE_URL/
        );

        expect(transport).not.toMatch(
          /requireEnv\(\s*["']MIGRATION_DATABASE_URL["']\s*\)/
        );

        expect(transport).not.toMatch(
          /loadEnvFile\(\s*["']\.env\.local["']\s*\)/
        );

        expect(transport).not.toMatch(
          /process\.env\.EVIDENCE_WORKER_DATABASE_URL/
        );

        expect(transport).not.toMatch(
          /requireEnv\(\s*["']EVIDENCE_WORKER_DATABASE_URL["']\s*\)/
        );

        expect(transport).not.toMatch(
          /service[_-]?role/i
        );
      }
    );


    it(
      "fails closed on database identity and role-boundary drift",
      ()=>{

        expect(transport).toContain(
          "vnext_occurrence_worker_login"
        );

        expect(transport).toContain(
          "vnext_occurrence_worker"
        );

        expect(transport).toContain(
          "vnext_runtime"
        );

        expect(transport).toContain(
          "vnext_evidence_worker"
        );

        expect(transport).toContain(
          "rolbypassrls"
        );

        expect(transport).toContain(
          "rolconnlimit"
        );
      }
    );


    it(
      "requires exactly the three worker commands and zero PUBLIC private-function drift",
      ()=>{

        expect(transport).toContain(
          "claim_occurrence_generation_schedule(text,integer)"
        );

        expect(transport).toContain(
          "complete_occurrence_generation_claim(uuid,uuid,text)"
        );

        expect(transport).toContain(
          "fail_occurrence_generation_claim(uuid,uuid,text,text,integer)"
        );

        expect(transport).toContain(
          "EXPECTED_FUNCTIONS"
        );

        expect(transport).toContain(
          "PUBLIC app_private EXECUTE privilege drift detected."
        );
      }
    );


    it(
      "provides claim, complete, and fail through SECURITY DEFINER commands only",
      ()=>{

        expect(transport).toMatch(
          /async claimSchedule[\s\S]*claim_occurrence_generation_schedule/i
        );

        expect(transport).toMatch(
          /async completeClaim[\s\S]*complete_occurrence_generation_claim/i
        );

        expect(transport).toMatch(
          /async failClaim[\s\S]*fail_occurrence_generation_claim/i
        );

        expect(transport).not.toMatch(
          /\b(insert|update|delete)\s+(into|public\.|from\s+public\.)/i
        );
      }
    );


    it(
      "parses the exact live 0022 return-column contract",
      ()=>{

        for(const field of [
          "result_schedule_id",
          "result_organization_id",
          "result_site_id",
          "result_claim_token",
          "result_lease_until",
          "result_attempt_count",
          "result_generated_count",
          "result_horizon_start",
          "result_horizon_end",
          "result_next_run_at"
        ]){
          expect(transport).toContain(field);
        }
      }
    );


    it(
      "keeps probe mode non-mutating",
      ()=>{

        expect(entry).toContain(
          'mode === "--probe"'
        );

        const probeStart =
          entry.indexOf(
            'if (mode === "--probe")'
          );

        const probeEnd =
          entry.indexOf(
            "} else if (",
            probeStart
          );

        expect(
          probeStart
        ).toBeGreaterThanOrEqual(0);

        expect(
          probeEnd
        ).toBeGreaterThan(
          probeStart
        );

        const probeBranch =
          entry.slice(
            probeStart,
            probeEnd
          );

        expect(
          probeBranch
        ).toContain(
          "No Schedule generation claim was requested."
        );

        expect(
          probeBranch
        ).toContain(
          "No Occurrence or generation-state mutation was requested."
        );

        expect(
          probeBranch
        ).not.toContain(
          "runOccurrenceGenerationWorker("
        );

        expect(entry).toContain(
          "No Schedule generation claim was requested."
        );

        expect(entry).toContain(
          "No Occurrence or generation-state mutation was requested."
        );

        expect(entry).not.toContain(
          ".claimSchedule("
        );

        expect(entry).not.toContain(
          ".completeClaim("
        );

        expect(entry).not.toContain(
          ".failClaim("
        );

        expect(pkg).toContain(
          '"worker:occurrence:probe": "node worker/occurrence-generation-worker.mjs --probe"'
        );
      }
    );

  }
);
