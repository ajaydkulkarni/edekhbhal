import fs from "node:fs";
import postgres from "postgres";

const migrationPath =
  "drizzle/0025_occurrence_generation_claim_concurrency_hardening.sql";

const rollingFixture =
  "1dbd8663-ead4-4a8e-8f4a-32e10852ebbf";

if (!fs.existsSync(migrationPath)) {
  throw new Error(
    "0025 migration source is missing."
  );
}

const migrationSql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

const databaseUrl =
  process.env.MIGRATION_DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL is missing."
  );
}

const db =
  postgres(
    databaseUrl,
    {
      max: 1,
      prepare: false,
      ssl: "require"
    }
  );


const expectedFunctions = [
  "app_private.claim_occurrence_generation_schedule(text,integer)",
  "app_private.complete_occurrence_generation_claim(uuid,uuid,text)",
  "app_private.fail_occurrence_generation_claim(uuid,uuid,text,text,integer)"
];


function same(
  left,
  right
) {
  return (
    JSON.stringify(left) ===
    JSON.stringify(right)
  );
}


try {

  console.log(
    "===== PRE-APPLY IDENTITY ====="
  );

  const identity =
    (await db`
      select
        current_user,
        session_user
    `)[0];

  console.log(
    JSON.stringify(
      identity,
      null,
      2
    )
  );

  if (
    identity.current_user !==
      "vnext_migrator"
  ) {
    throw new Error(
      `Expected vnext_migrator; got ${identity.current_user}.`
    );
  }

  console.log(
    "Migrator identity: PASS"
  );


  console.log();
  console.log(
    "===== PRE-APPLY 0025 GUARD ====="
  );

  const before =
    (await db`
      select

        (
          select count(*)::integer
          from pg_trigger t
          where
            t.tgrelid =
              'public.schedule_master'::regclass
            and not t.tgisinternal
            and t.tgname =
              'schedule_occurrence_generation_state_sync'
        ) as trigger_count,

        (
          select pg_get_functiondef(
            p.oid
          )
          from pg_proc p
          where p.oid =
            'app_private.claim_occurrence_generation_schedule(text,integer)'::regprocedure
        ) as claim_definition,

        (
          select md5(
            coalesce(
              jsonb_agg(
                to_jsonb(gs)
                order by gs.schedule_id
              )::text,
              '[]'
            )
          )
          from
            public.schedule_occurrence_generation_state gs
        ) as full_state_hash,

        (
          select count(*)::integer
          from public.schedule_master sm
          left join
            public.schedule_occurrence_generation_state gs
            on gs.schedule_id =
                 sm.id
          where gs.schedule_id is null
        ) as missing_state_count,

        (
          select count(*)::integer
          from public.schedule_master sm
          join
            public.schedule_occurrence_generation_state gs
            on gs.schedule_id =
                 sm.id
          where
            gs.organization_id
              is distinct from
              sm.organization_id
            or
            gs.site_id
              is distinct from
              sm.site_id
        ) as metadata_mismatch_count,

        (
          select count(*)::integer
          from public.schedule_occurrence
          where schedule_id =
            ${rollingFixture}::uuid
        ) as rolling_occurrence_count,

        (
          select count(*)::integer
          from public.schedule_occurrence_task sot
          join public.schedule_occurrence so
            on so.id =
                 sot.occurrence_id
          where so.schedule_id =
            ${rollingFixture}::uuid
        ) as rolling_task_count
    `)[0];


  console.log(
    JSON.stringify(
      {
        trigger_count:
          before.trigger_count,

        missing_state_count:
          before.missing_state_count,

        metadata_mismatch_count:
          before.metadata_mismatch_count,

        rolling_occurrence_count:
          before.rolling_occurrence_count,

        rolling_task_count:
          before.rolling_task_count,

        full_state_hash:
          before.full_state_hash
      },
      null,
      2
    )
  );


  if (
    Number(
      before.trigger_count
    ) !== 0
  ) {
    throw new Error(
      "0025 appears to already be applied. It will NOT be rerun."
    );
  }


  if (
    !/insert\s+into\s+public\.schedule_occurrence_generation_state/i.test(
      before.claim_definition
    )
  ) {
    throw new Error(
      "Live claim definition does not match expected pre-0025 state."
    );
  }


  if (
    Number(
      before.rolling_occurrence_count
    ) !== 5 ||
    Number(
      before.rolling_task_count
    ) !== 5
  ) {
    throw new Error(
      "Certified rolling fixture is not at 5/5."
    );
  }


  console.log(
    "0025 not already applied: PASS"
  );

  console.log(
    "Pre-0025 claim discovery INSERT present: PASS"
  );

  console.log(
    "Certified rolling fixture 5/5: PASS"
  );


  console.log();
  console.log(
    "===== PERMANENT 0025 APPLY ====="
  );

  await db.begin(
    async sql => {

      await sql.unsafe(
        migrationSql
      );

    }
  );


  console.log(
    "Migration 0025 applied successfully."
  );


  console.log();
  console.log(
    "===== POST-APPLY TRIGGER AUDIT ====="
  );

  const trigger =
    (await db`
      select
        t.tgname
          as trigger_name,

        pg_get_triggerdef(
          t.oid,
          true
        ) as trigger_definition,

        p.oid::regprocedure::text
          as function_signature,

        p.prosecdef
          as security_definer,

        r.rolname
          as owner_role

      from pg_trigger t

      join pg_proc p
        on p.oid =
             t.tgfoid

      join pg_roles r
        on r.oid =
             p.proowner

      where
        t.tgrelid =
          'public.schedule_master'::regclass

        and not t.tgisinternal

        and t.tgname =
          'schedule_occurrence_generation_state_sync'
    `)[0];


  if (!trigger) {
    throw new Error(
      "0025 trigger missing after apply."
    );
  }


  console.log(
    JSON.stringify(
      trigger,
      null,
      2
    )
  );


  if (
    trigger.function_signature !==
      "app_private.sync_schedule_occurrence_generation_state_from_schedule()" ||
    trigger.security_definer !== true ||
    trigger.owner_role !==
      "vnext_migrator"
  ) {
    throw new Error(
      "0025 trigger/function ownership contract failed."
    );
  }


  if (
    !/AFTER INSERT OR UPDATE OF organization_id, site_id ON schedule_master/i.test(
      trigger.trigger_definition
    )
  ) {
    throw new Error(
      "0025 trigger event contract failed."
    );
  }


  console.log(
    "0025 Schedule sync trigger: PASS"
  );

  console.log(
    "Trigger helper SECURITY DEFINER + migrator owned: PASS"
  );


  console.log();
  console.log(
    "===== TRIGGER HELPER PRIVILEGE AUDIT ====="
  );

  const helperPrivileges =
    (await db`
      with target as (
        select
          p.oid,
          p.proacl,
          p.proowner
        from pg_proc p
        where p.oid =
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()'::regprocedure
      )

      select
        exists(
          select 1
          from target t

          cross join lateral
            aclexplode(
              coalesce(
                t.proacl,
                acldefault(
                  'f',
                  t.proowner
                )
              )
            ) acl

          where
            acl.grantee = 0
            and acl.privilege_type =
                  'EXECUTE'
        ) as public_execute,

        has_function_privilege(
          'anon',
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()',
          'EXECUTE'
        ) as anon_execute,

        has_function_privilege(
          'authenticated',
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()',
          'EXECUTE'
        ) as authenticated_execute,

        has_function_privilege(
          'vnext_runtime',
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()',
          'EXECUTE'
        ) as runtime_execute,

        has_function_privilege(
          'vnext_evidence_worker',
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()',
          'EXECUTE'
        ) as evidence_execute,

        has_function_privilege(
          'vnext_occurrence_worker',
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()',
          'EXECUTE'
        ) as occurrence_execute,

        has_function_privilege(
          'vnext_occurrence_worker_login',
          'app_private.sync_schedule_occurrence_generation_state_from_schedule()',
          'EXECUTE'
        ) as occurrence_login_execute
    `)[0];


  console.log(
    JSON.stringify(
      helperPrivileges,
      null,
      2
    )
  );


  if (
    Object.values(
      helperPrivileges
    ).some(Boolean)
  ) {
    throw new Error(
      "0025 trigger helper leaked direct EXECUTE."
    );
  }


  console.log(
    "Trigger helper direct EXECUTE boundary: PASS"
  );


  console.log();
  console.log(
    "===== POST-APPLY CLAIM DEFINITION AUDIT ====="
  );

  const claim =
    (await db`
      select
        p.oid::regprocedure::text
          as signature,

        p.prosecdef
          as security_definer,

        r.rolname
          as owner_role,

        pg_get_functiondef(
          p.oid
        ) as definition

      from pg_proc p

      join pg_roles r
        on r.oid =
             p.proowner

      where p.oid =
        'app_private.claim_occurrence_generation_schedule(text,integer)'::regprocedure
    `)[0];


  console.log(
    `Signature: ${claim.signature}`
  );

  console.log(
    `SECURITY DEFINER: ${claim.security_definer}`
  );

  console.log(
    `Owner: ${claim.owner_role}`
  );


  if (
    claim.security_definer !== true ||
    claim.owner_role !==
      "vnext_migrator"
  ) {
    throw new Error(
      "0025 claim ownership/security contract failed."
    );
  }


  if (
    /insert\s+into\s+public\.schedule_occurrence_generation_state/i.test(
      claim.definition
    )
  ) {
    throw new Error(
      "Claim-time state INSERT still exists."
    );
  }


  if (
    /on\s+conflict\s*\(\s*schedule_id\s*\)/i.test(
      claim.definition
    )
  ) {
    throw new Error(
      "Claim-time ON CONFLICT still exists."
    );
  }


  if (
    !/for\s+update\s+of\s+gs\s+skip\s+locked/i.test(
      claim.definition
    )
  ) {
    throw new Error(
      "SKIP LOCKED missing."
    );
  }


  if (
    !/schedule_generation_claim_eligible/i.test(
      claim.definition
    )
  ) {
    throw new Error(
      "Eligibility helper missing."
    );
  }


  if (
    !/interval\s+'48 hours'/i.test(
      claim.definition
    )
  ) {
    throw new Error(
      "48-hour horizon missing."
    );
  }


  console.log(
    "Claim-time discovery INSERT removed: PASS"
  );

  console.log(
    "Claim-time ON CONFLICT removed: PASS"
  );

  console.log(
    "FOR UPDATE OF gs SKIP LOCKED retained: PASS"
  );

  console.log(
    "Eligibility helper retained: PASS"
  );

  console.log(
    "48-hour horizon retained: PASS"
  );


  console.log();
  console.log(
    "===== WORKER CAPABILITY AUDIT ====="
  );

  const workerFunctions =
    (
      await db`
        select
          p.oid::regprocedure::text
            as signature

        from pg_proc p

        join pg_namespace n
          on n.oid =
               p.pronamespace

        where
          n.nspname =
            'app_private'

          and has_function_privilege(
            'vnext_occurrence_worker',
            p.oid,
            'EXECUTE'
          )

        order by
          p.oid::regprocedure::text
      `
    ).map(
      row =>
        row.signature
    );


  const loginFunctions =
    (
      await db`
        select
          p.oid::regprocedure::text
            as signature

        from pg_proc p

        join pg_namespace n
          on n.oid =
               p.pronamespace

        where
          n.nspname =
            'app_private'

          and has_function_privilege(
            'vnext_occurrence_worker_login',
            p.oid,
            'EXECUTE'
          )

        order by
          p.oid::regprocedure::text
      `
    ).map(
      row =>
        row.signature
    );


  console.log(
    JSON.stringify(
      {
        workerFunctions,
        loginFunctions
      },
      null,
      2
    )
  );


  if (
    !same(
      workerFunctions,
      expectedFunctions
    ) ||
    !same(
      loginFunctions,
      expectedFunctions
    )
  ) {
    throw new Error(
      "0025 changed the exact three-function worker capability surface."
    );
  }


  console.log(
    "Occurrence capability exact three functions: PASS"
  );

  console.log(
    "Occurrence LOGIN exact three functions: PASS"
  );


  console.log();
  console.log(
    "===== GENERATION-STATE COVERAGE AUDIT ====="
  );

  const coverage =
    (await db`
      select
        (
          select count(*)::integer
          from public.schedule_master
        ) as schedule_count,

        (
          select count(*)::integer
          from public.schedule_occurrence_generation_state
        ) as state_count,

        (
          select count(*)::integer
          from public.schedule_master sm
          left join
            public.schedule_occurrence_generation_state gs
            on gs.schedule_id =
                 sm.id
          where gs.schedule_id is null
        ) as missing_state_count,

        (
          select count(*)::integer
          from public.schedule_master sm
          join
            public.schedule_occurrence_generation_state gs
            on gs.schedule_id =
                 sm.id
          where
            gs.organization_id
              is distinct from
              sm.organization_id

            or

            gs.site_id
              is distinct from
              sm.site_id
        ) as metadata_mismatch_count,

        (
          select md5(
            coalesce(
              jsonb_agg(
                to_jsonb(gs)
                order by gs.schedule_id
              )::text,
              '[]'
            )
          )
          from
            public.schedule_occurrence_generation_state gs
        ) as full_state_hash
    `)[0];


  console.log(
    JSON.stringify(
      coverage,
      null,
      2
    )
  );


  if (
    Number(
      coverage.missing_state_count
    ) !== 0 ||
    Number(
      coverage.metadata_mismatch_count
    ) !== 0
  ) {
    throw new Error(
      "Generation-state coverage or metadata synchronization failed."
    );
  }


  if (
    Number(
      before.missing_state_count
    ) === 0 &&
    Number(
      before.metadata_mismatch_count
    ) === 0 &&
    coverage.full_state_hash !==
      before.full_state_hash
  ) {
    throw new Error(
      "0025 unexpectedly changed existing generation-state rows even though no backfill repair was required."
    );
  }


  console.log(
    "Every Schedule has generation state: PASS"
  );

  console.log(
    "Generation-state organization/site synchronized: PASS"
  );

  console.log(
    "Existing generation-state rows preserved exactly: PASS"
  );


  console.log();
  console.log(
    "===== CERTIFIED ROLLING FIXTURE AUDIT ====="
  );

  const rolling =
    (await db`
      select

        (
          select count(*)::integer
          from public.schedule_occurrence
          where schedule_id =
            ${rollingFixture}::uuid
        ) as occurrence_count,

        (
          select count(*)::integer
          from public.schedule_occurrence_task sot
          join public.schedule_occurrence so
            on so.id =
                 sot.occurrence_id
          where so.schedule_id =
            ${rollingFixture}::uuid
        ) as task_count
    `)[0];


  console.log(
    JSON.stringify(
      rolling,
      null,
      2
    )
  );


  if (
    Number(
      rolling.occurrence_count
    ) !== 5 ||
    Number(
      rolling.task_count
    ) !== 5
  ) {
    throw new Error(
      "Certified rolling fixture changed during 0025 apply."
    );
  }


  console.log(
    "Certified rolling fixture remains 5/5: PASS"
  );


  console.log();
  console.log(
    "===== LIVE WORKER MUTATION GUARD ====="
  );

  console.log(
    "worker claim invoked: NO"
  );

  console.log(
    "worker complete invoked: NO"
  );

  console.log(
    "worker fail invoked: NO"
  );

  console.log(
    "worker:occurrence:once executed: NO"
  );

  console.log(
    "worker:occurrence:run executed: NO"
  );


  console.log();
  console.log(
    "04A MIGRATION 0025 LIVE APPLY + AUDIT: PASS"
  );

} finally {

  await db.end({
    timeout: 5
  });

}
