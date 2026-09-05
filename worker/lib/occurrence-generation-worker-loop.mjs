function envInt(
  name,
  defaultValue,
  {
    min,
    max
  }
) {
  const raw =
    process.env[name]?.trim();

  if (!raw) {
    return defaultValue;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`
    );
  }

  return value;
}


function safeError(error) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return (
    message
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1800) ||
    "Unknown occurrence worker error"
  );
}


function claimLeaseIsLive(claim) {
  const leaseUntil =
    Date.parse(
      claim.leaseUntil
    );

  return (
    Number.isFinite(leaseUntil) &&
    leaseUntil > Date.now()
  );
}


function sleep(
  milliseconds,
  signal
) {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise(
    resolve => {
      const timer =
        setTimeout(
          finish,
          milliseconds
        );

      const onAbort = () => {
        clearTimeout(timer);
        finish();
      };

      function finish() {
        signal?.removeEventListener(
          "abort",
          onAbort
        );

        resolve();
      }

      signal?.addEventListener(
        "abort",
        onAbort,
        {
          once: true
        }
      );
    }
  );
}


export function occurrenceWorkerConfig() {
  return {
    leaseSeconds:
      envInt(
        "OCCURRENCE_WORKER_LEASE_SECONDS",
        120,
        {
          min: 15,
          max: 300
        }
      ),

    pollIntervalMs:
      envInt(
        "OCCURRENCE_WORKER_POLL_INTERVAL_MS",
        5_000,
        {
          min: 500,
          max: 60_000
        }
      ),

    retryAfterSeconds:
      envInt(
        "OCCURRENCE_WORKER_RETRY_AFTER_SECONDS",
        60,
        {
          min: 15,
          max: 900
        }
      )
  };
}


export async function processOneOccurrenceGenerationClaim(
  transport,
  config = occurrenceWorkerConfig()
) {
  const claim =
    await transport.claimSchedule(
      config.leaseSeconds
    );

  if (!claim) {
    return false;
  }

  console.log(
    `Occurrence worker claimed Schedule ${claim.scheduleId}; attempt ${claim.attemptCount}.`
  );

  try {

    const completed =
      await transport.completeClaim(
        claim.scheduleId,
        claim.claimToken
      );

    if (
      completed.scheduleId !==
        claim.scheduleId
    ) {
      throw new Error(
        "Occurrence generation completion Schedule id does not match the claimed Schedule."
      );
    }

    console.log(
      `Occurrence worker completed Schedule ${completed.scheduleId}; generated ${completed.generatedCount} new Occurrence row(s) through ${completed.horizonEnd}.`
    );

    return true;

  } catch (error) {

    const message =
      safeError(error);

    /*
     * fail_occurrence_generation_claim itself requires the original live
     * claim token + worker id + unexpired lease.
     *
     * If the lease is already expired, do not issue a stale failure command.
     * The database lease is the recovery boundary and another worker may
     * reclaim the Schedule after expiry.
     */
    if (!claimLeaseIsLive(claim)) {
      console.warn(
        `Occurrence worker claim lease expired before failure handling for Schedule ${claim.scheduleId}; leaving recovery to the database lease. Error: ${message}`
      );

      throw error;
    }

    try {

      const failedScheduleId =
        await transport.failClaim(
          claim.scheduleId,
          claim.claimToken,
          message,
          config.retryAfterSeconds
        );

      if (
        failedScheduleId !==
          claim.scheduleId
      ) {
        throw new Error(
          "Occurrence generation failure acknowledgement Schedule id does not match the claimed Schedule."
        );
      }

      console.warn(
        `Occurrence worker scheduled retry for Schedule ${claim.scheduleId}: ${message}`
      );

      return true;

    } catch (failureError) {

      /*
       * Completion may have committed while the client lost the response.
       * In that case the claim has already been cleared and failClaim will
       * correctly reject the stale token. Do not attempt any direct-table
       * repair; the database command/lease boundary remains authoritative.
       */
      console.warn(
        `Occurrence worker could not acknowledge failure for Schedule ${claim.scheduleId}: ${safeError(failureError)}`
      );

      throw error;
    }
  }
}


export async function runOccurrenceGenerationWorker(
  transport,
  {
    once = false,
    signal,
    config = occurrenceWorkerConfig()
  } = {}
) {

  if (once) {

    const worked =
      await processOneOccurrenceGenerationClaim(
        transport,
        config
      );

    if (!worked) {
      console.log(
        "Occurrence worker found no currently due Schedule generation work."
      );
    }

    return;
  }


  console.log(
    `Occurrence generation worker ${transport.workerId} started rolling-horizon loop.`
  );


  while (!signal?.aborted) {

    try {

      const worked =
        await processOneOccurrenceGenerationClaim(
          transport,
          config
        );

      if (!worked) {
        await sleep(
          config.pollIntervalMs,
          signal
        );
      }

    } catch (error) {

      console.error(
        `Occurrence generation worker loop error: ${safeError(error)}`
      );

      await sleep(
        config.pollIntervalMs,
        signal
      );
    }
  }


  console.log(
    "Occurrence generation worker stop requested; current loop exited."
  );
}
