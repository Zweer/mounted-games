# AGENTS.md — mounted-games

Universal steering file for AI agents working on this project.

## Project Identity

**mounted-games** is a mobile-first web portal for **live scoring, results archive and
statistics** of the Mounted Games equestrian discipline, at Italian and European level.

No official data feed exists. Results live on two third-party portals that work poorly
but are the de-facto sources:

- **mg-scoreboard.de** — German, PHP, the richest source (IMGA European/World
  championships). Server-rendered HTML with predictable query params.
- **pmglivescore.altervista.org** — Italian, WordPress, archive + timetable. Imports
  competitions via an XML format.

The portal **polls** these sources near-real-time, normalizes the data into its own
relational model, and adds what the originals lack: statistics and profiles for
athletes, horses, teams and nations, plus a **crowdsourcing** layer (registration +
approval) to fill in data the sources hide behind opaque labels (e.g. a team shown
only as "Italy" with no athletes).

## Stack

- **Framework:** Next.js (latest, App Router, Turbopack, Server Actions) — monolith
  (frontend + API routes + ingestion route all in one app)
- **UI:** shadcn/ui + Tailwind CSS (latest) — mobile-first
- **Auth:** Better Auth (Drizzle adapter) — powers the crowdsourcing contributor flow
- **DB:** Neon PostgreSQL + Drizzle ORM — relational (joins for cross-entity stats)
- **Scraping:** native `fetch` + `cheerio` in production. Playwright is used **only**
  during the discovery phase, never in the production poller.
- **Hosting:** Vercel
- **Lint/Format:** Biome (NOT ESLint/Prettier)
- **Testing:** Vitest
- **Package manager:** npm (lockfile `package-lock.json`)

## Key Technical Context

### Ingestion (the one thing outside the request cycle)

The poller is a Next.js route (`/api/poll`) pinged by an **external scheduler**
(cron-job.org to start; migratable to AWS Lambda + EventBridge later). It does
**bounded work per tick** (processes the few stalest live targets, not a whole event),
uses a per-fetch timeout (`AbortSignal`), and is **gated to live windows** (outside a
competition it returns immediately). This sidesteps both Vercel's function-duration
limit and cron-frequency limits.

### Sources are scraped, not API-fed

Production scrapers parse server-rendered HTML with `cheerio`. Each source has its own
parser behind a shared `Scraper` interface + registry. The exact URL patterns,
selectors and field mappings are reverse-engineered by the `rev-eng` agent and
documented in `docs/sources/*.md` — that documentation is the scrapers' source of truth.

## Agent Architecture

### `rev-eng` — Reverse Engineering Agent
- **Purpose:** discover how the two source portals expose their data, using Playwright
  (network interception + DOM inspection)
- **Output:** scraping contract in `docs/sources/*.md` (URL patterns, hidden JSON/AJAX
  endpoints, XML import format, HTML selectors, field maps)
- **Tools:** Playwright MCP; write access limited to `docs/sources/**`

### `dev` — Development Agent
- **Purpose:** implement the Next.js app, DB schema, scrapers and poller from the specs
  and the `docs/sources/*.md` contract
- **Output:** `app/`, `lib/`, `db/`, `components/`, config

### Workflow

```
rev-eng (Playwright) → docs/sources/*.md → dev (implementation) → app/ + lib/ + db/
```

## Kiro Configuration

```
.kiro/
├── agents/     rev-eng.json, dev.json
├── prompts/    rev-eng.md, dev.md
├── steering/   code-style, build-tooling, commit-conventions, interaction, nextjs
├── docs/       functional-spec.md (product vision)
└── specs/      00-setup, 01-ingestion, ... (numbered, requirements + design/architecture + tasks)
```

## Conventions (Summary)

Full details in `.kiro/steering/`. Key rules:

- TypeScript strict, no `any`, explicit return types on exports
- Next.js App Router: Server Components by default, `'use client'` only when needed
- Biome for lint + format (double quotes, semicolons, 2-space indent)
- Drizzle ORM, schema in `db/schema.ts`, `drizzle-kit push` for dev
- Vitest for tests (AAA pattern), scrapers tested against fixed HTML fixtures
- Conventional commits + gitmoji (text codes, not emoji)

## Interaction Rules

- **Language:** conversation in Italian; code, comments, commits, docs, specs in English
- **Git:** NEVER commit, push, or create tags — the developer handles all git operations;
  prepare changes and suggest a commit message
- **Interview before implementing** for ambiguous requests; **plan before implementing**
  for multi-step tasks
- **Scraping etiquette:** rate-limit requests, set timeouts, never hammer the sources;
  poll only during live windows
