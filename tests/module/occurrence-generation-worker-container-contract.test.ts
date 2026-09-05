import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";


const dockerfilePath =
  path.resolve(
    process.cwd(),
    "worker/Dockerfile.occurrence"
  );


const evidenceDockerfilePath =
  path.resolve(
    process.cwd(),
    "worker/Dockerfile"
  );


describe(
  "Occurrence Generation Worker 04A container contract",
  () => {

    it(
      "uses a dedicated Dockerfile without replacing the Evidence worker container",
      () => {

        expect(
          fs.existsSync(
            dockerfilePath
          )
        ).toBe(true);

        expect(
          fs.existsSync(
            evidenceDockerfilePath
          )
        ).toBe(true);

      }
    );


    it(
      "uses the occurrence worker non-mutating health check",
      () => {

        const text =
          fs.readFileSync(
            dockerfilePath,
            "utf8"
          );

        expect(text).toMatch(
          /HEALTHCHECK[\s\S]*occurrence-generation-worker\.mjs","--health-check"/i
        );

      }
    );


    it(
      "runs the continuous occurrence worker by default",
      () => {

        const text =
          fs.readFileSync(
            dockerfilePath,
            "utf8"
          );

        expect(text).toMatch(
          /CMD\s*\[\s*"node"\s*,\s*"worker\/occurrence-generation-worker\.mjs"\s*,\s*"--run"\s*\]/i
        );

      }
    );


    it(
      "keeps the occurrence worker container DB-only and does not install Evidence media tooling",
      () => {

        const text =
          fs.readFileSync(
            dockerfilePath,
            "utf8"
          );

        expect(text).not.toMatch(
          /\bffmpeg\b/i
        );

        expect(text).not.toMatch(
          /evidence-worker/i
        );

        expect(text).not.toMatch(
          /--media-check/i
        );

      }
    );


    it(
      "runs unprivileged under dumb-init with production-only dependencies",
      () => {

        const text =
          fs.readFileSync(
            dockerfilePath,
            "utf8"
          );

        expect(text).toMatch(
          /npm\s+ci\s+--omit=dev/i
        );

        expect(text).toMatch(
          /USER\s+node/i
        );

        expect(text).toMatch(
          /ENTRYPOINT\s*\[\s*"dumb-init"\s*,\s*"--"\s*\]/i
        );

      }
    );

  }
);
