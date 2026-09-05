import fs from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";


const loop =
  fs.readFileSync(
    "worker/lib/occurrence-generation-worker-loop.mjs",
    "utf8"
  );

const entry =
  fs.readFileSync(
    "worker/occurrence-generation-worker.mjs",
    "utf8"
  );

const pkg =
  fs.readFileSync(
    "package.json",
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A runtime-loop contract",
  () => {

    it(
      "uses bounded lease, poll, and retry configuration",
      () => {

        expect(loop).toContain(
          "OCCURRENCE_WORKER_LEASE_SECONDS"
        );

        expect(loop).toContain(
          "OCCURRENCE_WORKER_POLL_INTERVAL_MS"
        );

        expect(loop).toContain(
          "OCCURRENCE_WORKER_RETRY_AFTER_SECONDS"
        );

        expect(loop).toMatch(
          /leaseSeconds[\s\S]*min:\s*15[\s\S]*max:\s*300/i
        );

        expect(loop).toMatch(
          /pollIntervalMs[\s\S]*min:\s*500[\s\S]*max:\s*60_000/i
        );

        expect(loop).toMatch(
          /retryAfterSeconds[\s\S]*min:\s*15[\s\S]*max:\s*900/i
        );
      }
    );


    it(
      "--once claims at most one Schedule and completes it through the transport",
      () => {

        expect(loop).toContain(
          "processOneOccurrenceGenerationClaim"
        );

        expect(loop).toMatch(
          /await transport\.claimSchedule\(/i
        );

        expect(loop).toMatch(
          /await transport\.completeClaim\(/i
        );

        expect(loop).toMatch(
          /if \(once\)[\s\S]*processOneOccurrenceGenerationClaim/i
        );

        const onceBranch =
          loop.indexOf(
            "if (once)"
          );

        const continuousLoop =
          loop.indexOf(
            "while (!signal?.aborted)"
          );

        expect(
          onceBranch
        ).toBeGreaterThanOrEqual(0);

        expect(
          continuousLoop
        ).toBeGreaterThan(
          onceBranch
        );

        const onceSection =
          loop.slice(
            onceBranch,
            continuousLoop
          );

        expect(
          onceSection
        ).toContain(
          "return;"
        );
      }
    );


    it(
      "uses claim-bound retry and never direct-table repair",
      () => {

        expect(loop).toMatch(
          /await transport\.failClaim\(/i
        );

        expect(loop).toContain(
          "claimLeaseIsLive"
        );

        expect(loop).toContain(
          "leaving recovery to the database lease"
        );

        expect(loop).toContain(
          "Do not attempt any direct-table"
        );

        expect(loop).not.toMatch(
          /\b(insert|update|delete)\s+(into|public\.|from\s+public\.)/i
        );
      }
    );


    it(
      "supports continuous polling with graceful abort",
      () => {

        expect(loop).toMatch(
          /while \(!signal\?\.aborted\)/
        );

        expect(loop).toContain(
          "pollIntervalMs"
        );

        expect(loop).toContain(
          'signal?.addEventListener('
        );

        expect(loop).toContain(
          '"abort"'
        );

        expect(loop).toContain(
          "stop requested; current loop exited"
        );
      }
    );


    it(
      "wires SIGTERM/SIGINT shutdown and explicit runtime modes",
      () => {

        expect(entry).toContain(
          '"--probe"'
        );

        expect(entry).toContain(
          '"--health-check"'
        );

        expect(entry).toContain(
          '"--once"'
        );

        expect(entry).toContain(
          '"--run"'
        );

        expect(entry).toContain(
          '"SIGTERM"'
        );

        expect(entry).toContain(
          '"SIGINT"'
        );

        expect(entry).toContain(
          "AbortController"
        );

        expect(entry).toContain(
          "requestStop"
        );
      }
    );


    it(
      "keeps probe and health modes non-mutating",
      () => {

        expect(entry).toContain(
          "No Schedule generation claim was requested."
        );

        expect(entry).toContain(
          "Health check is non-mutating; no Schedule claim was requested."
        );

        expect(entry).toMatch(
          /else if \(\s*mode === "--health-check"\s*\)/
        );
      }
    );


    it(
      "wires probe, health, once, and run package commands",
      () => {

        expect(pkg).toContain(
          '"worker:occurrence:probe": "node worker/occurrence-generation-worker.mjs --probe"'
        );

        expect(pkg).toContain(
          '"worker:occurrence:health": "node worker/occurrence-generation-worker.mjs --health-check"'
        );

        expect(pkg).toContain(
          '"worker:occurrence:once": "node worker/occurrence-generation-worker.mjs --once"'
        );

        expect(pkg).toContain(
          '"worker:occurrence:run": "node worker/occurrence-generation-worker.mjs --run"'
        );
      }
    );

  }
);
