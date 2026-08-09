# Ingestion Requirements

## Goal

Near-real-time collection of Mounted Games results from the two source portals,
normalized into our relational model, without hammering the sources and within Vercel's
function-duration limits.

## Prerequisite — Source Discovery (rev-eng)

Before implementing scrapers, the `rev-eng` agent documents the scraping contract in
`docs/sources/*.md`:
- `mg-scoreboard.md`, `pmglivescore.md`, `README.md`
- URL patterns, any hidden JSON/AJAX live endpoint, the XML import format, HTML
  selectors, field maps, enums (categories/phases/fields), and the opaque-label gaps.

The finalized domain schema depends on this discovery output.

## Core Flow

```
External scheduler (cron-job.org → POST /api/poll, CRON_SECRET)
  → live-window gate: any active competition now? if not, return immediately
  → pick the few stalest live scrape targets (bounded work per tick)
  → Scraper.fetch (AbortSignal timeout) → parse (cheerio) → normalized records
  → upsert into DB (idempotent) + dedup
  → update target last_scraped_at
```

## Features

### 1. Scraper interface & registry
- Shared `Scraper` interface (fetch + parse → normalized records)
- One implementation per source, registered in a registry
- Parsing follows `docs/sources/*.md` exactly

### 2. Source scrapers
- `mg-scoreboard` — event list, standings/toplist, teams, sessions, finals, timetable;
  prefer a JSON/AJAX live endpoint if discovery finds one, else parse HTML
- `pmglivescore` — competition pages / timetable; use the XML import format if it is the
  cleanest path

### 3. Poller route (`/api/poll`)
- Bearer `CRON_SECRET` auth
- Live-window gating (return fast outside competitions)
- Bounded work per tick (N stalest live targets), per-fetch `AbortSignal` timeout
- Resilient: a slow/failed target is skipped and retried next tick

### 4. Normalization & upsert
- Map raw records to domain entities (competition/category/phase/heat/participant/result)
- Idempotent upserts keyed on stable source IDs
- Dedup across sources where the same competition appears on both

### 5. Scheduling
- Start with cron-job.org pinging `/api/poll` every 2-5 min during live windows
- Migration path documented to AWS Lambda + EventBridge if Vercel limits bite

## Success Criteria

- Discovery docs exist and are accurate against captured fixtures
- Each scraper extracts a sample event correctly (tested against fixed HTML/XML fixtures)
- `/api/poll` respects the live-window gate and stays within the function-duration limit
- Upserts are idempotent (re-running a tick produces no duplicates)

## Non-Goals

- No Playwright in production (discovery only)
- No statistics/aggregation (that's `02-schema-stats`)
- No live UI (that's `03-live-archive`)
- No client-side polling of the third-party sources (only our server polls them)
