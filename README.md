# eDekhbhal

A multi-tenant SaaS foundation for organization, property, work-area and QR management.

## Current foundation

- Passwordless email authentication flow with development magic-link fallback.
- Organization onboarding; authenticated creator becomes `ADMIN`.
- Tenant membership model with `ADMIN`, `PROPERTY_MANAGER`, and `USER` roles.
- Property and Work Area domain models.
- Work Area QR lifecycle: generate on creation, regenerate to invalidate the previous code, and separate reprint concept.
- Subscription/plan schema with starter/professional/enterprise seed plans.
- Immutable-style append-only audit event table capturing user, action, timestamp, old/new values, result, and context.
- Tenant-scoped audit screen.
- Docker Compose PostgreSQL for local development.

## Stack

- Next.js App Router + TypeScript
- Prisma ORM
- PostgreSQL
- QRCode generation
- Zod validation

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL:

```bash
docker compose up -d db
```

3. Install dependencies:

```bash
npm install
```

4. Push the schema and seed plans:

```bash
npm run db:push
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Important development note

The current registration flow exposes the generated magic link on the response page so the project can be tested without an email provider. Before production, connect a transactional email provider (such as Resend) and never return the magic link in an API response.

The QR reprint endpoint is intentionally not treated as production-ready yet; the next implementation should add a secure server-side QR rendering/printing path without exposing persisted secrets.

## Next build increments

1. Production-grade email delivery and session hardening.
2. Full user invitation and role/permission UI.
3. Property and Work Area CRUD screens with QR print/regenerate actions.
4. Secure QR rendering/download endpoint.
5. Subscription provider integration and entitlement enforcement.
6. Complete API authorization middleware and database row-level tenant safeguards.
7. Mobile application consuming the same API.
8. Expanded audit coverage for every business action.
