# Cloudflare-Native Migration — Requirements

## Goal

Move the portal off **Vercel + Neon** (pay-per-invocation compute + pay-per-compute-hour
Postgres) onto a **Cloudflare-native** stack, to eliminate the recurring cost driven by
the near-real-time poller. In the same effort, land the documented ingestion data-quality
fixes (spec `04`) so the first ingest on the new database is already correct, making its
otherwise-destructive backfill (04/R5) free.

Target stack:

- **Runtime:** [ViNext](https://github.com/cloudflare/vinext) (Next.js on Vite) on
  Cloudflare Workers — validated against this project's `next-intl` i18n stack (probe
  2026-09-30: all three attachment points work). **OpenNext is the documented fallback**
  if a Workers-real end-to-end test in Phase C reveals a blocker.
- **Database:** **Cloudflare D1** (SQLite) via `drizzle-orm/d1`, replacing Neon Postgres.
- **Scheduler:** **Cloudflare Cron Triggers** replacing the external cron
  (cron-job.org → `/api/poll`).
- **Live-window gate:** **Cloudflare KV** (or a Durable Object) instead of a per-tick
  Postgres query, so an off-season empty tick touches no database.

## Cost rationale (why we are doing this)

The current spend is dominated by **poller invocations × Neon queries**, not UI CPU. The
poller pings `/api/poll` on a short interval; every tick runs `hasLiveTargets()` which is
at least one Neon query even when there is nothing to do (~43k queries/month just to say
"idle"). Cloudflare Workers' free/cheap tier + D1 + a KV-based idle gate remove both the
per-invocation compute cost and the idle-tick database cost.

## Scope

### R1 — Database ported to SQLite/D1
- The full domain schema (`db/models/*.ts`) is expressed in `drizzle-orm/sqlite-core`
  instead of `pg-core`, preserving semantics.
- Postgres-only constructs are mapped deliberately (see design; the load-bearing ones are
  `pgEnum` → text+check, `numeric` money → integer cents, `jsonb`/`date`/`timestamp` →
  text, `serial` → integer autoincrement).
- The DB driver (`db/index.ts`) binds to the D1 binding in production and to a local
  SQLite file / Miniflare in dev/test.
- Better Auth's Drizzle adapter is switched to the SQLite dialect.
- Acceptance: `drizzle-kit` generates SQLite migrations; the read-layer and upsert test
  suites pass against the SQLite engine; no `pg-core` import remains.

### R2 — Test engine unified on SQLite
- DB-backed tests (`read-layer.test.ts`, `standings.test.ts`, `upsert.test.ts`) run
  against an in-memory / temp-file SQLite that matches production D1 dialect, replacing
  the current PGlite (`@electric-sql/pglite`) harness.
- Scraper/parser tests (fixture-based, DB-independent) are unchanged.
- Acceptance: `npm test` is green on SQLite; no test contacts a network database.

### R3 — Ingestion data-quality fixes landed (spec 04, R1–R4)
- Implement spec `04` R1 (dates), R2 (mg grouping + name), R3 (level inference), R4
  (recent-result navigation) **before** the first production seed on D1, so the initial
  ingest is correct.
- The scraper review is done **one source at a time, verified against real results**:
  `rev-eng` re-checks the live sources first (they may have changed since the 2026-08-18
  audit) and refreshes `docs/sources/*.md`; then parsers + fixtures are rewritten with the
  fixes and tests go green before moving to the next source.
- 04/R5 (destructive backfill) is **absorbed** by the fresh D1 database — no in-place
  re-group migration is needed; the first seed produces correct data directly.
- Acceptance: fixture tests for date parsing, `groupingKey`, level inference, and the
  recent-result `competitionId` are green; a seed against a scratch D1 yields
  chronologically-ordered, correctly-grouped, level-tagged competitions.

### R4 — Runtime on ViNext + Cloudflare Workers
- The app builds and runs under ViNext (`vite build` / `vinext`), deployed to Workers via
  Wrangler.
- `next-intl` i18n (locale routing, `next/root-params`, `proxy.ts` middleware + auth
  guard) works end-to-end on Workers — re-verified against a **real D1 + a real
  request path** (the earlier probe used Node + a dummy DB).
- Acceptance: a Workers deployment (preview) serves `/`, `/it`, `/en`, an entity page and
  the live view; locale routing and the `/contribute` auth redirect work; a documented
  OpenNext fallback path exists if a Workers blocker appears.

### R5 — Scheduler + idle gate moved to Cloudflare
- The poller is invoked by a **Cloudflare Cron Trigger** (Worker `scheduled` handler),
  not an external HTTP pinger; the `CRON_SECRET` bearer model is replaced by the trigger's
  own auth boundary (the scheduled handler is not publicly invokable).
- The live-window gate reads/writes **KV** (a small `is-live` flag + next-check
  timestamp), so an idle tick performs **zero D1 queries**. The authoritative
  `refreshLiveWindow` recomputation still runs on its own (less frequent) cadence and
  writes the KV flag.
- Bounded-work-per-tick and per-fetch `AbortSignal` timeouts (spec 01) are preserved.
- Acceptance: an off-season tick returns without a D1 query (verified by a query counter /
  log); a simulated live window still polls and persists.

### R6 — Deploy + clean seed
- Wrangler config (`wrangler.toml`/`.jsonc`) defines the Worker, the D1 binding, the KV
  namespace and the cron schedule. Environment/secrets documented in `.env.example` and
  the Cloudflare dashboard equivalents.
- First production deploy runs D1 migrations, then a **clean seed** that ingests with the
  corrected scrapers (R3) — this is the "backfill" and it is non-destructive because the
  database starts empty.
- Acceptance: the deployed site reflects correct data (dates, grouping, level, working
  links); the cron is firing; cost telemetry (Workers/D1 usage) confirms the idle-tick
  cost is gone.

## Success Criteria

- No Vercel/Neon dependency remains in the runtime path; the app runs on Workers + D1 + KV.
- `npm test` green on SQLite; typecheck + Biome green.
- The four spec-04 data bugs are fixed and visible on the deployed site.
- An idle poller tick costs zero database queries.
- Measured monthly cost is materially below the Vercel+Neon baseline (the reason for the
  project).

## Non-Goals

- **No product/UI redesign.** Routes, components, i18n structure and shadcn UI are
  preserved as-is. (The archive IA overhaul noted in spec 04 stays a separate follow-up.)
- **No new features.** Crowdsourcing (`05-crowdsourcing` in the functional spec) is
  unaffected and out of scope here; this migration is infrastructure + the already-scoped
  04 data fixes only.
- **No cross-source event grouping / parent `event` table** (04 non-goal, still holds).
- **No commitment to ViNext before the Workers-real test.** If Phase C surfaces a
  blocker, we fall back to OpenNext — the DB (R1/R2), scraper (R3) and scheduler (R5)
  phases are runtime-agnostic and do not change.

## Dependencies & Risks

- **ViNext maturity.** ViNext is 1.0 but young; its own README points to OpenNext as the
  "safer, more proven" option. Mitigation: R4 keeps OpenNext as a documented fallback and
  the runtime phase is deliberately late (after DB + scrapers are done and independently
  valuable).
- **`--legacy-peer-deps` needed.** `shadcn@4.16.2` pins `@babel/core@7` while the ViNext
  toolchain wants `@babel/core@8`; the install needs `--legacy-peer-deps` (ViNext's own
  documented remedy). Track for a cleaner resolution at dependency-bump time.
- **`numeric` → integer-cents is a behavioural change.** Scores (48.5, penalty points)
  currently use exact Postgres `numeric(6,2)`; SQLite has no exact decimal. Storing
  integer cents changes the read-layer cast helper and every points comparison — must be
  covered by tests (R1/R2 acceptance).
- **D1 limits.** D1 has per-query row and database-size limits; the current data volume is
  small, but the stats joins (standings) must be checked against D1's query constraints in
  Phase A.
- **Sources may have drifted.** The 04 audit is from 2026-08-18; `rev-eng` re-verifies
  live before parser rewrites (R3).
