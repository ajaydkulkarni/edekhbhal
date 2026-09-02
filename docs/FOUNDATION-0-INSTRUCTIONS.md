# Foundation 0 — Exact Installation Instructions

## Preconditions

You must already be on the clean `vNext` branch and `git status` must be clean.

Do not delete the existing Supabase project or Vercel deployment.

## Install this package

After extracting/copying the Foundation 0 files into `/workspaces/edekhbhal`:

```bash
cd /workspaces/edekhbhal

git branch --show-current
git status

npm install

npm run lint
npm run typecheck
npm run test
npm run build
```

Then install Playwright Chromium and run the landing-page E2E test:

```bash
npx playwright install chromium
npm run test:e2e
```

If all commands pass:

```bash
git add .
git commit -m "vNext Foundation 0 application skeleton"
git push origin vNext
```

Then send the full terminal output back for verification.

## Do not configure Supabase yet

The Supabase clients and Drizzle foundation are present, but the landing page deliberately does not require environment variables.

After this package is validated and committed, the next guided step is:
1. create the new Supabase project;
2. collect the new project URL/publishable key and database URLs;
3. create dedicated database roles;
4. apply the first RLS-native migrations;
5. enable the database/RLS integration test suite.

Do not reuse the legacy Supabase connection strings.
