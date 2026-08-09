# Setup Requirements

## Goal

A deployable Next.js project with database, auth, and dev tooling — ready to build the
ingestion and portal features on top of.

## Features

### 1. Project Scaffold
- Next.js (latest) with App Router and Turbopack
- Tailwind CSS (latest) with dark/light mode (system preference), mobile-first
- shadcn/ui initialized (`components/ui/`, excluded from linting)
- Biome for lint + format (double quotes, semicolons, 2-space indent)

### 2. Database
- Neon PostgreSQL + Drizzle ORM
- `db/schema.ts` with the **auth tables** only at this stage (Better Auth: user,
  session, account, verification); domain tables come in `01-ingestion` / `02-schema-stats`
- `drizzle.config.ts` + `db:push` / `db:generate` / `db:studio` scripts
- Schema kept vendor-neutral Postgres

### 3. Authentication
- Better Auth with the Drizzle adapter
- A `role` / `status` field on the user to support the contributor approval flow later
  (e.g. `role: viewer | contributor | admin`, `status: pending | approved`)
- Auth route handler + client; `middleware.ts` guarding contributor/admin areas

### 4. Dev Tooling
- lefthook pre-commit: biome, lockfile-lint, typecheck
- commitlint (conventional commits)
- Vitest configured
- `.kiro/` agents, prompts, steering already in place
- `.env.example` documenting required env (`DATABASE_URL`, Better Auth secrets,
  `CRON_SECRET`, source base URLs)
- `vercel.json` if/when a Vercel Cron entry is needed

## Success Criteria

- `npm run build` passes
- `npm run lint` passes
- Drizzle schema pushes to Neon
- Better Auth flow works (sign in, session)
- lefthook hooks run on commit

## Non-Goals

- No domain tables yet (competitions/athletes/etc.) — defined after source discovery
- No scraping or poller logic (that's `01-ingestion`)
- No real UI beyond a placeholder home page
- No production Vercel deployment (done manually later)
