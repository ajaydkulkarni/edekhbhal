# RLS Runtime Foundation 01 — Upload / Test Order

This batch does **not** enable Row Level Security on any business table.

## Files

Upload to `v2-rebuild`:

1. `supabase-rls-runtime-foundation-01.sql` → repository root
2. `src/lib/tenantDbContext.ts`
3. `src/app/api/e2e/rls-context/route.ts`
4. `e2e/rls-context.spec.ts`

## Database step

Before testing the new endpoint, run the complete contents of:

`supabase-rls-runtime-foundation-01.sql`

in the Supabase SQL Editor for the database used by the V2 deployment.

The final SELECT should return NULL for all four context columns.

## Deploy

Deploy `v2-rebuild` to the V2 web project.

## Tests

First:

```bash
npx playwright test e2e/rls-context.spec.ts
```

Expected:

```text
3 passed
```

Then:

```bash
npm run test:e2e
```

Expected full suite:

```text
36 passed
```

## Stop condition

If the context test fails, do not enable RLS and do not migrate business routes yet.
