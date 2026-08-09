# Ingestion Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  EXTERNAL SCHEDULER (cron-job.org, every 2-5 min)            │
│  POST /api/poll   Authorization: Bearer <CRON_SECRET>        │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│  LIVE-WINDOW GATE                                            │
│  Any competition active now? No → 200 {skipped} immediately  │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│  TARGET SELECTION (bounded)                                  │
│  Pick N stalest live scrape_targets (ORDER BY last_scraped)  │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│  FETCH & PARSE (per target)                                  │
│  registry.get(source).fetch(url, AbortSignal) → parse(cheerio)│
│  slow/failed → skip, retry next tick                         │
└───────────────┬─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────┐
│  NORMALIZE → UPSERT → DEDUP                                  │
│  raw → domain records; idempotent upsert on source IDs       │
│  update target.last_scraped_at                               │
└─────────────────────────────────────────────────────────────┘
```

## File Organization

```
app/api/poll/route.ts          # scheduler entry point (CRON_SECRET, orchestration)
lib/
├── scrapers/
│   ├── types.ts               # Scraper interface + normalized record types
│   ├── registry.ts            # source → Scraper
│   ├── mg-scoreboard.ts       # HTML (or JSON) parser
│   └── pmglivescore.ts        # HTML / XML parser
├── ingest/
│   ├── poll.ts                # orchestrator: gate → select → fetch → upsert
│   ├── live-window.ts         # is there an active competition now?
│   ├── targets.ts             # scrape_targets selection + staleness
│   └── upsert.ts              # idempotent upserts + cross-source dedup
db/schema.ts                   # scrape_targets + domain tables (finalized post-discovery)
```

## Key Decisions

- **cheerio, not a browser** — sources are server-rendered; Playwright is discovery-only.
- **Bounded work per tick** — the poller never scrapes a whole event at once; it processes
  the few stalest live targets, keeping each invocation well under the function timeout.
- **Per-fetch `AbortSignal` timeout** (~8-10s) — a slow source page is abandoned and
  retried next tick instead of failing the whole invocation.
- **Live-window gating** — outside a competition the poller returns immediately, so a
  1-per-minute external ping costs almost nothing off-season and is polite to the sources.
- **Idempotent upserts on stable source IDs** — re-running a tick never duplicates data;
  this also makes cross-source dedup tractable when a competition appears on both.
- **`scrape_targets` table** — the unit of work (source, url, kind, is_live,
  last_scraped_at); the poller reads/writes it, so "what to scrape next" is data, not code.
- **Migration path** — if Vercel's duration limit bites on big live events, move the
  poller body to an AWS Lambda on an EventBridge 1-min schedule, reusing the same
  `lib/scrapers` + `lib/ingest` code and writing to the same Neon DB.

## Open (pending discovery)

- Whether mg-scoreboard exposes a JSON/AJAX live endpoint (would replace HTML parsing).
- The exact pmglivescore XML import format (potential cleanest source).
- Final domain table shapes — decided once `docs/sources/*.md` is complete.
