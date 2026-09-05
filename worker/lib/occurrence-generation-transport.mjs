import fs from "node:fs";
import postgres from "postgres";

const EXPECTED_FUNCTIONS = [
  "app_private.claim_occurrence_generation_schedule(text,integer)",
  "app_private.complete_occurrence_generation_claim(uuid,uuid,text)",
  "app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)"
];

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) continue;

    const i = line.indexOf("=");

    if (i < 1) continue;

    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadOccurrenceWorkerEnv() {
  /*
   * Deliberately load only the dedicated Occurrence worker secret file.
   *
   * Do not fall back to .env.local:
   * the worker must never silently inherit MIGRATION_DATABASE_URL or an
   * application-runtime database credential.
   */
  loadEnvFile(".env.occurrence-worker.local");
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required.`
    );
  }

  return value;
}

function requireWorkerId(value) {
  const workerId = value.trim();

  if (!workerId) {
    throw new Error(
      "OCCURRENCE_WORKER_ID cannot be empty."
    );
  }

  if (workerId.length > 200) {
    throw new Error(
      "OCCURRENCE_WORKER_ID cannot exceed 200 characters."
    );
  }

  return workerId;
}

function parseClaim(row) {
  if (!row) return null;

  const scheduleId =
    String(row.result_schedule_id ?? "");

  const organizationId =
    String(row.result_organization_id ?? "");

  const siteId =
    String(row.result_site_id ?? "");

  const claimToken =
    String(row.result_claim_token ?? "");

  const leaseUntil =
    String(row.result_lease_until ?? "");

  const attemptCount =
    Number(row.result_attempt_count);

  if (
    !scheduleId ||
    !organizationId ||
    !siteId ||
    !claimToken ||
    !leaseUntil ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 1
  ) {
    throw new Error(
      "Occurrence generation claim returned an invalid result contract."
    );
  }

  return {
    scheduleId,
    organizationId,
    siteId,
    claimToken,
    leaseUntil,
    attemptCount
  };
}

function parseCompletion(row) {
  if (!row) {
    throw new Error(
      "Occurrence generation completion returned no row."
    );
  }

  const scheduleId =
    String(row.result_schedule_id ?? "");

  const generatedCount =
    Number(row.result_generated_count);

  const horizonStart =
    String(row.result_horizon_start ?? "");

  const horizonEnd =
    String(row.result_horizon_end ?? "");

  const nextRunAt =
    String(row.result_next_run_at ?? "");

  if (
    !scheduleId ||
    !Number.isInteger(generatedCount) ||
    generatedCount < 0 ||
    !horizonStart ||
    !horizonEnd ||
    !nextRunAt
  ) {
    throw new Error(
      "Occurrence generation completion returned an invalid result contract."
    );
  }

  return {
    scheduleId,
    generatedCount,
    horizonStart,
    horizonEnd,
    nextRunAt
  };
}

async function auditIdentity(db) {
  const identity = (await db`
    select
      current_user,
      session_user,

      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls,
      r.rolcanlogin,
      r.rolinherit,
      r.rolconnlimit,

      pg_has_role(
        current_user,
        'vnext_occurrence_worker',
        'member'
      ) as occurrence_member,

      pg_has_role(
        current_user,
        'vnext_runtime',
        'member'
      ) as runtime_member,

      pg_has_role(
        current_user,
        'vnext_evidence_worker',
        'member'
      ) as evidence_worker_member

    from pg_roles r
    where r.rolname=current_user
  `)[0];

  if (!identity) {
    throw new Error(
      "Unable to inspect Occurrence worker database identity."
    );
  }

  if (
    identity.current_user !==
      "vnext_occurrence_worker_login" ||
    identity.session_user !==
      "vnext_occurrence_worker_login"
  ) {
    throw new Error(
      `Unexpected Occurrence worker database identity: ${identity.current_user}.`
    );
  }

  if (
    identity.rolsuper ||
    identity.rolcreatedb ||
    identity.rolcreaterole ||
    identity.rolreplication ||
    identity.rolbypassrls ||
    !identity.rolcanlogin ||
    !identity.rolinherit ||
    identity.rolconnlimit !== 3
  ) {
    throw new Error(
      "Occurrence worker database LOGIN has unsafe role attributes."
    );
  }

  if (
    !identity.occurrence_member ||
    identity.runtime_member ||
    identity.evidence_worker_member
  ) {
    throw new Error(
      "Occurrence worker database LOGIN has an unauthorized role membership."
    );
  }

  return identity;
}

async function auditFunctionSurface(db) {
  const rows = await db`
    select
      p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n
      on n.oid=p.pronamespace
    where n.nspname='app_private'
      and has_function_privilege(
        current_user,
        p.oid,
        'EXECUTE'
      )
    order by
      p.oid::regprocedure::text
  `;

  const actual =
    rows.map(
      row => row.signature
    );

  const missing =
    EXPECTED_FUNCTIONS.filter(
      signature =>
        !actual.includes(signature)
    );

  const unexpected =
    actual.filter(
      signature =>
        !EXPECTED_FUNCTIONS.includes(signature)
    );

  if (
    actual.length !==
      EXPECTED_FUNCTIONS.length ||
    missing.length ||
    unexpected.length
  ) {
    throw new Error(
      `Occurrence worker function surface drift: expected exactly three commands; missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)}.`
    );
  }

  const schemaUsage = Boolean(
    (
      await db`
        select has_schema_privilege(
          current_user,
          'app_private',
          'USAGE'
        ) as allowed
      `
    )[0]?.allowed
  );

  if (!schemaUsage) {
    throw new Error(
      "Occurrence worker lacks required app_private schema USAGE."
    );
  }

  const publicCount = Number(
    (
      await db`
        select count(*)::bigint as count
        from pg_proc p
        join pg_namespace n
          on n.oid=p.pronamespace
        where n.nspname='app_private'
          and has_function_privilege(
            'public',
            p.oid,
            'EXECUTE'
          )
      `
    )[0]?.count ?? 0
  );

  if (publicCount !== 0) {
    throw new Error(
      "PUBLIC app_private EXECUTE privilege drift detected."
    );
  }

  return actual;
}

async function auditTableBoundary(db) {
  const access = (await db`
    select
      has_table_privilege(
        current_user,
        'public.organization',
        'SELECT'
      ) as organization_select,

      has_table_privilege(
        current_user,
        'public.site',
        'SELECT'
      ) as site_select,

      has_table_privilege(
        current_user,
        'public.work_area',
        'SELECT'
      ) as work_area_select,

      has_table_privilege(
        current_user,
        'public.schedule_master',
        'SELECT'
      ) as schedule_select,

      has_table_privilege(
        current_user,
        'public.schedule_task',
        'SELECT'
      ) as schedule_task_select,

      has_table_privilege(
        current_user,
        'public.schedule_occurrence',
        'SELECT'
      ) as occurrence_select,

      has_table_privilege(
        current_user,
        'public.schedule_occurrence_task',
        'SELECT'
      ) as occurrence_task_select,

      has_table_privilege(
        current_user,
        'public.schedule_occurrence_generation_state',
        'SELECT'
      ) as generation_state_select,

      has_table_privilege(
        current_user,
        'public.schedule_occurrence_generation_state',
        'INSERT'
      ) as generation_state_insert,

      has_table_privilege(
        current_user,
        'public.schedule_occurrence_generation_state',
        'UPDATE'
      ) as generation_state_update,

      has_table_privilege(
        current_user,
        'public.schedule_occurrence_generation_state',
        'DELETE'
      ) as generation_state_delete
  `)[0];

  if (
    Object.values(access)
      .some(Boolean)
  ) {
    throw new Error(
      "Occurrence worker has unexpected effective table privileges."
    );
  }

  return access;
}

export async function openOccurrenceGenerationTransport() {
  loadOccurrenceWorkerEnv();

  const databaseUrl =
    requireEnv(
      "OCCURRENCE_WORKER_DATABASE_URL"
    );

  const workerId =
    requireWorkerId(
      requireEnv(
        "OCCURRENCE_WORKER_ID"
      )
    );

  const db =
    postgres(
      databaseUrl,
      {
        max: 2,
        prepare: false,
        ssl: "require"
      }
    );

  try {
    const identity =
      await auditIdentity(db);

    const executableFunctions =
      await auditFunctionSurface(db);

    await auditTableBoundary(db);

    return {
      workerId,
      databaseRole:
        identity.current_user,

      executableFunctions,

      async claimSchedule(
        leaseSeconds = 120
      ) {
        if (
          !Number.isInteger(leaseSeconds) ||
          leaseSeconds < 15 ||
          leaseSeconds > 300
        ) {
          throw new Error(
            "Occurrence generation lease must be an integer between 15 and 300 seconds."
          );
        }

        const row = (
          await db`
            select *
            from app_private.claim_occurrence_generation_schedule(
              ${workerId},
              ${leaseSeconds}
            )
          `
        )[0];

        return parseClaim(row);
      },

      async completeClaim(
        scheduleId,
        claimToken
      ) {
        if (!scheduleId || !claimToken) {
          throw new Error(
            "Schedule id and claim token are required for completion."
          );
        }

        const row = (
          await db`
            select *
            from app_private.complete_occurrence_generation_claim(
              ${scheduleId}::uuid,
              ${claimToken}::uuid,
              ${workerId}
            )
          `
        )[0];

        return parseCompletion(row);
      },

      async failClaim(
        scheduleId,
        claimToken,
        errorMessage,
        retryAfterSeconds = 60
      ) {
        if (!scheduleId || !claimToken) {
          throw new Error(
            "Schedule id and claim token are required for failure handling."
          );
        }

        const message =
          String(errorMessage ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1800);

        if (!message) {
          throw new Error(
            "Occurrence generation failure message is required."
          );
        }

        if (
          !Number.isInteger(retryAfterSeconds) ||
          retryAfterSeconds < 15 ||
        retryAfterSeconds > 3600
        ) {
          throw new Error(
            "Occurrence generation retry delay must be an integer between 15 and 3600 seconds."
          );
        }

        const row = (
          await db`
            select
              app_private.fail_occurrence_generation_claim(
                ${scheduleId}::uuid,
                ${claimToken}::uuid,
                ${workerId},
                ${message},
                ${retryAfterSeconds}
              ) as result_schedule_id
          `
        )[0];

        const resultScheduleId =
          String(
            row?.result_schedule_id ?? ""
          );

        if (!resultScheduleId) {
          throw new Error(
            "Occurrence generation failure command returned no Schedule id."
          );
        }

        return resultScheduleId;
      },

      async close() {
        await db.end({
          timeout: 5
        });
      }
    };

  } catch (error) {
    await db.end({
      timeout: 5
    });

    throw error;
  }
}
