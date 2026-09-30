# Cloudflare-Native Migration — Tasks

Checklist implementing `design.md`. Each phase leaves the tree green (typecheck + Biome +
tests). Branch: `feat/cloudflare-migration`. The developer owns all git operations.

## Phase A — Database port (R1, R2)

- [ ] A1. Add SQLite dev/test driver deps (`better-sqlite3` or Miniflare D1 shim) and
  `@cloudflare/workers-types`; plan removal of `@neondatabase/serverless` + `pglite`.
- [ ] A2. Rewrite `db/models/enums.ts` — keep the 9 string tuples, switch `pgEnum(...)` to
  the sqlite-core `text(name, { enum: tuple })` form. TS unions must stay identical.
- [ ] A3. Port `db/models/competition.ts`, `result.ts`, `participant.ts`, `reference.ts`,
  `ingestion.ts`, `crowdsource.ts`, `auth.ts` to `drizzle-orm/sqlite-core` per the type
  map (serial→integer autoincrement, jsonb→text json, date→text, timestamp→integer ts,
  boolean→integer boolean).
- [ ] A4. **Money-as-cents**: change `result.pointsTotal`/`penaltyPoints`,
  `gameResult.points` to `integer` cents; rename columns to `*_cents`.
- [ ] A5. Update `db/relations.ts` if any typed column refs changed (should be minimal).
- [ ] A6. Rewrite `db/index.ts` as a request-scoped, dialect-aware factory (D1 in prod,
  better-sqlite in dev/test); remove the import-time `DATABASE_URL` throw.
- [ ] A7. Fix ripple callers of the old `db` singleton (poll/seed/admin routes, queries,
  `auth.ts`) to use the request-scoped handle.
- [ ] A8. Update the read-layer cents helper (`cents → number`, `/100`) in one place;
  update ingest to write `Math.round(x*100)`.
- [ ] A9. `drizzle.config.ts` → `dialect: "sqlite"`; `drizzle-kit generate` a fresh
  SQLite `0000_*` baseline; retire the Postgres migrations (git history keeps them).
- [ ] A10. Better Auth adapter → `provider: "sqlite"`; regenerate auth tables in the
  baseline migration.
- [ ] A11. Verify: typecheck + Biome green, no `pg-core` import remains.

## Phase A′ — Test engine unified (R2)

- [ ] A12. Replace the PGlite test harness with an in-memory/temp SQLite that matches D1
  dialect (set `PRAGMA foreign_keys=ON`).
- [ ] A13. Port `read-layer.test.ts`, `standings.test.ts`, `upsert.test.ts` to the SQLite
  harness; add cents round-trip + ranking/tie assertions.
- [ ] A14. Confirm scraper/parser fixture tests are untouched and still green.
- [ ] A15. `npm test` fully green on SQLite; remove `@electric-sql/pglite`.

## Phase B — Scraper data-quality fixes (R3 → spec 04)

- [ ] B1. `rev-eng`: re-verify **both** sources live (Playwright); refresh
  `docs/sources/mg-scoreboard.md` + `pmglivescore.md` if selectors/URLs drifted since
  2026-08-18.
- [ ] B2. **pmglivescore first**: refresh fixtures from verified live HTML; implement 04
  R1 (inline `DD/MM/YYYY` dates) + R3 (level: `CAMPIONATI ITALIANI` → national); tests
  green; spot-check a real scrape into scratch D1.
- [ ] B3. 04 R4 recent-result link fix (`getRecentResults` returns `competitionId`;
  `recent-result-item.tsx` links to `/competitions/{competitionId}`) + read-layer test.
- [ ] B4. **mg-scoreboard next**: refresh fixtures; implement 04 R1 (date threading:
  `scrape_target.startsOn`, `DiscoveredTarget.startsOn`, list capture, poller inject,
  upsert fill) — note `scrape_target.startsOn` already exists as text after Phase A.
- [ ] B5. mg 04 R2 (grouping/name): `stripCategorySuffixAndPrefix`, year-aware
  `groupingKey`, base-name `name`, `category.label` verbatim, prefix/spaced band parsing;
  grouping fixture tests green.
- [ ] B6. mg 04 R3 (level inference `lib/ingest/level.ts`, ordered regex table); level
  tests green.
- [ ] B7. Add `lib/ingest/dates.ts` helpers (German list date, upcoming `D. Mon YY`, pmg
  numeric) with `dates.test.ts`.
- [ ] B8. Full ingest dry-run into scratch D1 for both sources; eyeball correctness
  (dates, grouping, level, links). Typecheck + Biome + tests green.

## Phase C — Runtime: ViNext + Workers (R4)

- [ ] C1. Install ViNext toolchain (`--legacy-peer-deps`); `vinext init`; commit generated
  `vite.config.ts` + scripts; add `@cloudflare/vite-plugin`.
- [ ] C2. Wire request-scoped `env` access (`getEnv()` + DB handle) in poll/seed/auth
  routes for the Workers runtime.
- [ ] C3. `wrangler dev` against a **real local D1** (Phase A migrations applied).
- [ ] C4. i18n re-verification checklist on Workers (record results in the PR):
  - [ ] `/` → 307 → `/it`; `Accept-Language: en` → `/en`.
  - [ ] DB-backed entity page renders with correct `<html lang>` and localized copy.
  - [ ] `/contribute` anon → auth redirect.
  - [ ] no "No intl context found" (#177) with real data.
- [ ] C5. **Decision gate**: if C4 passes → ViNext confirmed. If any point fails on
  Workers → switch to OpenNext (`@opennextjs/cloudflare`, keeps `next.config.ts` +
  `next-intl/plugin`), re-run C3–C4. Record the decision + evidence in the PR.

## Phase D — Scheduler, idle gate, deploy, seed (R5, R6)

- [ ] D1. Add `scheduled(event, env, ctx)` handler calling `processTargets`; declare the
  cron in `wrangler.jsonc`.
- [ ] D2. KV idle gate: `poller:is-live` + `poller:next-refresh` keys; `hasLiveTargets`
  hot path reads KV (zero D1 on idle); `refreshLiveWindow` writes the KV flag on its
  coarser cadence.
- [ ] D3. Decide the fate of `/api/poll` (drop, or keep behind `CRON_SECRET` for manual
  triggers) and `refreshLiveWindow` cadence.
- [ ] D4. `wrangler.jsonc`: Worker, `nodejs_compat`, D1 binding, KV binding, cron trigger;
  `wrangler secret put` for Better Auth + source URLs; update `.env.example`.
- [ ] D5. Preview deploy: `wrangler d1 migrations apply` → `wrangler deploy` (preview env).
- [ ] D6. Clean seed on the empty D1 (corrected scrapers); verify live: chronological
  order, grouped multi-band events, level badges, working links, cron firing.
- [ ] D7. Idle-tick test (KV path = zero D1 queries) + live-window integration test.
- [ ] D8. Cost check: Workers/D1 usage telemetry confirms the idle-tick cost is gone vs
  the Vercel+Neon baseline.
- [ ] D9. Cutover: point production at the Workers deploy; decommission Vercel/Neon once
  verified.

## Cross-cutting

- [ ] Update `AGENTS.md` + `.kiro/steering/build-tooling.md` + `nextjs.md` to reflect the
  new stack (D1, ViNext/Wrangler, Cron Triggers, KV) once Phase C's runtime is confirmed.
- [ ] Keep `docs/sources/*.md` as the scraper source of truth (updated in B1).
