import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";


const loop =
  fs.readFileSync(
    path.resolve(
      process.cwd(),
      "worker/lib/occurrence-generation-worker-loop.mjs"
    ),
    "utf8"
  );


const transport =
  fs.readFileSync(
    path.resolve(
      process.cwd(),
      "worker/lib/occurrence-generation-transport.mjs"
    ),
    "utf8"
  );


const migration =
  fs.readFileSync(
    path.resolve(
      process.cwd(),
      "drizzle/0022_occurrence_generation_worker.sql"
    ),
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A retry contract",
  () => {

    it(
      "keeps the database failure command bounded to 15..3600 seconds",
      () => {

        expect(migration).toMatch(
          /p_retry_after_seconds\s+is\s+null[\s\S]*p_retry_after_seconds\s*<\s*15[\s\S]*p_retry_after_seconds\s*>\s*3600/i
        );

        expect(migration).toMatch(
          /next_run_at\s*=[\s\S]*now\s*\(\s*\)[\s\S]*make_interval\s*\([\s\S]*secs\s*=>\s*p_retry_after_seconds/i
        );

      }
    );


    it(
      "does not permit worker runtime retry configuration below the database minimum",
      () => {

        expect(loop).toMatch(
          /"OCCURRENCE_WORKER_RETRY_AFTER_SECONDS"\s*,\s*60\s*,\s*\{\s*min:\s*15\s*,\s*max:\s*900/i
        );

      }
    );


    it(
      "validates direct transport retry requests against the database command bounds",
      () => {

        expect(transport).toMatch(
          /!Number\.isInteger\s*\(\s*retryAfterSeconds\s*\)[\s\S]{0,200}retryAfterSeconds\s*<\s*15[\s\S]{0,200}retryAfterSeconds\s*>\s*3600/i
        );

      }
    );


    it(
      "uses the configured retry delay when acknowledging a live failed claim",
      () => {

        expect(loop).toMatch(
          /await\s+transport\.failClaim\s*\([\s\S]*claim\.scheduleId[\s\S]*claim\.claimToken[\s\S]*message[\s\S]*config\.retryAfterSeconds[\s\S]*\)/i
        );

        expect(loop).toMatch(
          /if\s*\(\s*!claimLeaseIsLive\s*\(\s*claim\s*\)\s*\)[\s\S]*leaving recovery to the database lease/i
        );

      }
    );

  }
);
