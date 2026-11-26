# Contributing to AGMX

Thanks for your interest in contributing to AGMX!

## Local Setup

Requirements: **Node 22.6+** (24 recommended), **[Bun](https://bun.sh)**, and **PostgreSQL 15+**.

```sh
git clone https://github.com/nearbycoder/agmx.io
cd agmx.io
bun install
cp .env.example .env
bun run db:migrate
bun run dev
```

With `MAIL_TRANSPORT=log` (the default without AWS keys), sign-in links and outbound mail are printed to the terminal, and `POST /api/dev/inbound` lets you inject test emails locally.

## Checks Before Opening a PR

Run these from the repo root:

```sh
bun run typecheck
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/agmx_test bun run test
bun run build
```

> Note: `tests/*.test.ts` drop and recreate the `public` schema in `TEST_DATABASE_URL` on each run — always point it at a dedicated test database.

### API & SDK Changes

If you change any endpoint or schema under `src/shared/api/`, regenerate the OpenAPI spec and TypeScript SDK types and commit the result (CI enforces that they stay in sync):

```sh
bun run sdk:types
cd packages/sdk && npm run build
```

### Database Schema Changes

If you edit `src/server/db/schema.ts`, generate a Drizzle migration:

```sh
bun run db:generate
```

## Pull Requests

- Keep changes focused and include tests for new behavior or bug fixes.
- Follow the existing code style (Effect 4 services, Drizzle queries, TanStack Start routes).
- Never commit secrets, `.env` files, or instance-specific credentials.
