#!/usr/bin/env node

import {
  openOccurrenceGenerationTransport
} from "./lib/occurrence-generation-transport.mjs";

import {
  runOccurrenceGenerationWorker
} from "./lib/occurrence-generation-worker-loop.mjs";


const mode =
  process.argv[2] ?? "";


const supportedModes =
  new Set([
    "--probe",
    "--health-check",
    "--once",
    "--run"
  ]);


if (!supportedModes.has(mode)) {

  console.log(
    "Occurrence Rolling-Horizon Generation Worker Foundation 04A is installed."
  );

  console.log(
    "Use --probe to verify identity/capabilities, --health-check for a non-mutating runtime check, --once to process at most one due Schedule, or --run for the continuous worker loop."
  );

} else {

  let worker;

  const controller =
    new AbortController();

  const requestStop = () => {
    controller.abort();
  };

  process.once(
    "SIGTERM",
    requestStop
  );

  process.once(
    "SIGINT",
    requestStop
  );


  try {

    worker =
      await openOccurrenceGenerationTransport();


    if (mode === "--probe") {

      console.log(
        "Occurrence generation worker transport probe passed."
      );

      console.log(
        `Database role: ${worker.databaseRole}`
      );

      console.log(
        `Worker id: ${worker.workerId}`
      );

      console.log(
        `Executable app_private commands: ${worker.executableFunctions.length}`
      );

      console.log(
        "Dedicated LOGIN inheritance and exact three-function capability boundary verified."
      );

      console.log(
        "No Schedule generation claim was requested."
      );

      console.log(
        "No Occurrence or generation-state mutation was requested."
      );


    } else if (
      mode === "--health-check"
    ) {

      console.log(
        "Occurrence generation worker health check passed."
      );

      console.log(
        `Database role: ${worker.databaseRole}`
      );

      console.log(
        `Executable app_private commands: ${worker.executableFunctions.length}`
      );

      console.log(
        "Health check is non-mutating; no Schedule claim was requested."
      );


    } else {

      await runOccurrenceGenerationWorker(
        worker,
        {
          once:
            mode === "--once",

          signal:
            controller.signal
        }
      );
    }

  } finally {

    process.removeListener(
      "SIGTERM",
      requestStop
    );

    process.removeListener(
      "SIGINT",
      requestStop
    );

    if (worker) {
      await worker.close();
    }
  }
}
