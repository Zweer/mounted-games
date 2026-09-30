# Cloudflare-Native Migration — Design

Implements `requirements.md`. Organized as four sequential phases **A → B → C → D**. Each
phase is independently valuable and leaves the tree green (typecheck + Biome + tests).
Phases A, B and D are runtime-agnostic; only Phase C commits to ViNext (with an OpenNext
fallback), which is why it is deliberately late.

```
Phase A  DB port (PG → SQLite/D1)  ─── unifies test engine (R1, R2)
Phase B  Scraper fixes (spec 04 R1–R4) ── one source at a time, verified (R3)
Phase C  Runtime (ViNext + Workers) ── i18n re-verified on real D1 (R4)
Phase D  Deploy + Cron/KV + clean seed (R5, R6)
```

All work happens on a branch `feat/cloudflare-migration`; the developer owns all git
operations (per steering) — this spec never commits.

---

## Phase A — Database port (R1, R2)

### A.1 Type mapping (the load-bearing decisions)

Every `db/models/*.ts` file moves its imports from `drizzle-orm/pg-core` to
`drizzle-orm/sqlite-core`. The non-mechanical mappings:

| Postgres (today) | SQLite/D1 (target) | Notes |
|---|---|---|
| `serial().primaryKey()` | `integer().primaryKey({ autoIncrement: true })` | rowid-backed; identity semantics preserved |
| `pgEnum(...)` (×9) | `text({ enum: [...] })` | Drizzle SQLite `text` accepts an `enum` tuple → same TS union type, CHECK-like narrowing at the type level; keep the enum tuples in `db/models/enums.ts`, just change the constructor |
| `numeric("points_total",{precision:6,scale:2})` | `integer("points_total_cents")` | **money-as-integer-cents.** 48.50 → 4850. Store cents; the read layer divides by 100. See A.3 |
| `jsonb("native_params")` | `text("native_params",{ mode:"json" })` | Drizzle serializes/parses JSON transparently; type stays the object shape |
| `date("starts_on")` | `text("starts_on")` | ISO `YYYY-MM-DD` string (already how scrapers produce dates) |
| `timestamp("last_scraped_at")` | `integer("last_scraped_at",{ mode:"timestamp" })` | Unix epoch; Drizzle maps to `Date`. Or `text` ISO — pick `timestamp` mode for range queries |
| `boolean("is_live")` | `integer("is_live",{ mode:"boolean" })` | 0/1 ↔ boolean via Drizzle |
| `.references(... {onDelete:"cascade"})` | same, but **`PRAGMA foreign_keys=ON`** must be set on the D1/SQLite connection | D1 enforces FKs only when the pragma is on |
| partial/`unique` indexes | `uniqueIndex` / `index` in sqlite-core | the `result_participant_phase_heat_uq` NULL-heat semantics behave the same (NULLs distinct) |

Enums (`db/models/enums.ts`) keep their exact string tuples — only the constructor
changes (`pgEnum(name, tuple)` → the `text(name, { enum: tuple })` form used inline in
each table). This keeps every downstream TS union identical, so query code and Zod
schemas do not change.

### A.2 Driver (`db/index.ts`)

Replace the Neon binding with a dialect-aware factory:

- **Production (Workers):** `drizzle(env.DB, { schema })` from `drizzle-orm/d1`, where
  `env.DB` is the D1 binding. The `db` handle is created per-request from the Worker
  `env` (no module-level singleton throwing on a missing `DATABASE_URL`).
- **Dev/test:** `drizzle(new Database(path), { schema })` via `better-sqlite3` (or the
  Miniflare D1 shim) against a temp file / `:memory:`.

Because Workers has no ambient `process.env.DATABASE_URL`, the current
import-time throw in `db/index.ts` is removed; the handle is constructed where the
request `env` is available (route handlers / server components via a request-scoped
accessor). This is the one structural change that ripples into callers — enumerate and
adjust them in A.4.

### A.3 The money-as-cents change

`result.pointsTotal`, `result.penaltyPoints`, `gameResult.points` become integer cents.

- Ingest (`lib/ingest/upsert.ts`): multiply parsed decimals by 100 on write
  (`Math.round(x * 100)`).
- Read layer: the existing "cast numeric string → number" helper becomes "cents → number"
  (`n / 100`). Centralize in one helper so standings/aggregations stay correct.
- Tests: extend `upsert.test.ts` and `standings.test.ts` to assert cents round-trip and
  that ranking/tie logic is unaffected (integer compares are actually *more* reliable than
  float here).

### A.4 Ripple points (enumerate + fix)

- `db/index.ts` consumers that import the module-level `db` singleton — switch to the
  request-scoped handle.
- `db/schema.ts` barrel — unchanged (still re-exports models + relations).
- `drizzle.config.ts` — `dialect: "sqlite"`, driver `d1-http` (or better-sqlite for
  local), migration out dir `db/`.
- Better Auth (`auth.ts`) — Drizzle adapter `provider: "sqlite"`.
- Seed/reset routes (`app/api/seed`, `app/api/admin`) — use the request-scoped handle.

### A.5 Migrations

`drizzle-kit generate` produces fresh SQLite migrations (a new `0000_*` baseline for the
SQLite dialect — the Postgres migrations under `db/` are retired, kept in git history).
Apply locally with better-sqlite; apply to D1 with `wrangler d1 migrations apply`.

---

## Phase B — Scraper data-quality fixes (R3 → spec 04 R1–R4)

This phase **executes spec `04`** (`.kiro/specs/04-ingestion-data-quality`) — it is not
re-specified here. The migration adds only two framing rules:

1. **Re-verify sources live first.** The 04 audit is dated 2026-08-18. Before rewriting
   any parser, `rev-eng` re-runs discovery (Playwright) on both sources and refreshes
   `docs/sources/mg-scoreboard.md` / `pmglivescore.md`. If a selector/URL drifted, the 04
   design's concrete selectors are updated in the doc first (docs are the scrapers' source
   of truth per AGENTS.md).
2. **One source at a time, verified against real output.** Order: `pmglivescore` first
   (simpler — inline dates, grouping already correct, only date extraction + level), then
   `mg-scoreboard` (harder — date threading, grouping/name rewrite, level). Each source:
   update fixtures from the freshly-verified live HTML → implement the 04 fixes → tests
   green → spot-check a real scrape into a scratch D1 → only then move on.

Follows spec 04's own work breakdown (R4 link fix, R1 dates, R2 grouping/name, R3 level),
minus **04/R5** — the destructive backfill is dropped, replaced by Phase D's clean seed on
the empty D1.

Tests land where 04 specifies them: `lib/ingest/dates.test.ts`,
`lib/scrapers/mg-scoreboard.grouping.test.ts`, `lib/ingest/level.test.ts`, plus the
read-layer and upsert extensions — all now running on SQLite (Phase A).

---

## Phase C — Runtime: ViNext + Workers (R4)

### C.1 Migration mechanics (from the 2026-09-30 probe)

- Add devDeps: `vinext`, `vite`, `@vitejs/plugin-react`, `@vitejs/plugin-rsc`,
  `react-server-dom-webpack` — install with **`--legacy-peer-deps`** (shadcn/babel peer
  conflict, documented).
- `vinext init` generates `vite.config.ts` (`plugins: [vinext()]`) and
  `dev:vinext`/`build:vinext`/`start:vinext` scripts. `next.config.ts` is left in place
  (ViNext auto-detects `i18n/request.ts`; `next-intl/plugin` is a tolerated no-op).
- Add the `@cloudflare/vite-plugin` so the whole app (pages + API + scheduled handler)
  runs in one Worker in dev and prod.

### C.2 i18n re-verification (the one thing the probe did NOT cover)

The probe ran on **Node target + a dummy DB**. Phase C re-verifies the three attachment
points on a **real Workers dev runtime (`wrangler dev`) against a real local D1**:

- `next/root-params` locale resolution on a DB-backed page (not just `/live/demo`).
- `proxy.ts` middleware: locale redirect + `Accept-Language` negotiation + the
  `/contribute` auth-cookie guard, on Workers.
- next-intl client-component context (issue #177 watch) with real data.

If any of these fails on Workers where it passed on Node, **switch to OpenNext**
(`@opennextjs/cloudflare`): it adapts `next build` output, keeps `next.config.ts` +
`next-intl/plugin` verbatim, and does not touch the app code. This is a config-layer swap,
not a code rewrite — Phases A/B/D are unaffected.

### C.3 Route-handler env access

Workers pass bindings via `env`, not `process.env`. The request-scoped DB handle from A.2
plus a small `getEnv()` accessor (from the Worker context) replace the module-level
`process.env` reads in the poll/seed/auth routes. `NEXT_PUBLIC_*` client vars are still
build-time inlined.

---

## Phase D — Scheduler, idle gate, deploy, clean seed (R5, R6)

### D.1 Cron Trigger + scheduled handler

- `wrangler.jsonc` declares a `[triggers] crons = ["* * * * *"]` (or the chosen cadence)
  and a `scheduled(event, env, ctx)` handler that calls the existing poll logic
  (`lib/ingest/poll.ts` `processTargets`). The handler is **not publicly routable**, so
  the `CRON_SECRET` bearer check on `/api/poll` is no longer the trust boundary — keep
  `/api/poll` only if a manual trigger is still wanted (then keep its secret).
- Bounded-work-per-tick and per-fetch `AbortSignal` (spec 01) are preserved verbatim.

### D.2 KV idle gate

`lib/ingest/live-window.ts` `hasLiveTargets()` today runs a D1 query every tick. Replace
its hot path with KV:

- A KV key `poller:is-live` (`"1"`/`"0"`) + `poller:next-refresh` (epoch). The `scheduled`
  handler reads KV first; if `is-live == "0"` and `now < next-refresh`, it **returns
  immediately with zero D1 queries**.
- `refreshLiveWindow` (the authoritative recompute that hits the sources) runs on a
  coarser cadence (e.g. every N minutes, or when `next-refresh` elapses), recomputes
  `is_live` from the sources, and **writes the KV flag** + a new `next-refresh`.
- Net effect: off-season, the minute tick is a KV read (free-tier cheap) and no database
  touch at all — this is the core cost fix.

### D.3 Wrangler config + secrets

- `wrangler.jsonc`: Worker name, `main` (ViNext/OpenNext entry), `compatibility_date`,
  `compatibility_flags = ["nodejs_compat"]` (cheerio/scraper deps), the D1 binding
  (`[[d1_databases]]`), the KV binding (`[[kv_namespaces]]`), the cron trigger.
- Secrets via `wrangler secret put` (Better Auth secret, any source base URLs);
  `.env.example` updated to document the Workers equivalents.

### D.4 Deploy + clean seed

1. `wrangler d1 migrations apply` (creates the schema on the remote D1).
2. Deploy the Worker (`wrangler deploy`) — preview environment first.
3. Trigger the seed (`POST /api/seed` or a one-off scheduled run) — ingests with the
   corrected Phase B scrapers into the **empty** D1. This is the "backfill" (04/R5) and it
   is non-destructive by construction.
4. Verify live: chronological ordering, grouped multi-band events, level badges, working
   recent-result links, cron firing, and D1/Workers usage telemetry confirming the
   idle-tick cost is gone.

---

## Testing strategy across phases

- **A:** DB-backed suites (`read-layer`, `standings`, `upsert`) run on SQLite; add the
  cents round-trip assertions. `pglite` devDep removed.
- **B:** fixture suites per spec 04 (dates, grouping, level, recent-result link).
- **C:** a manual `wrangler dev` smoke checklist for i18n (the three attachment points on
  real D1); no automated Workers test required for sign-off, but the checklist is recorded
  in the PR.
- **D:** an idle-tick assertion (KV path performs zero D1 queries — via a query-count log
  or a Miniflare test), and a live-window integration test that a running event still
  polls + persists.

## Rollback

Each phase is a branch checkpoint. The heaviest risk (ViNext) is isolated to Phase C and
has the OpenNext escape hatch. Neon/Vercel stay live until Phase D's preview deploy is
verified, so cutover is a DNS/deploy switch, not a big-bang.

## Suggested commit sequence (developer runs git)

- `feat(db): :recycle: port schema and driver from Postgres to SQLite/D1`
- `test(db): :white_check_mark: run DB-backed suites on SQLite; drop pglite`
- `fix(scraper): :bug: land ingestion data-quality fixes (spec 04 R1–R4)`
- `feat(build): :hammer: migrate runtime to ViNext on Cloudflare Workers`
- `feat(poller): :zap: move scheduler to Cron Trigger + KV idle gate`
- `feat(deploy): :rocket: wrangler config, D1/KV bindings, clean seed`
