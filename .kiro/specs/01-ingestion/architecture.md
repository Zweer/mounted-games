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
│  NORMALIZE → UPSERT                                          │
│  raw → domain records (polymorphic participant:              │
│  team | individual | pair); attach scores by label-join      │
│  within the event; idempotent upsert on per-source ids;      │
│  update target.last_scraped_at. No cross-source dedup.       │
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
- **Idempotent upserts on stable per-source IDs** — re-running a tick never duplicates
  data (mg `event id`/`team_id`; pmg `post_id` + normalized label). No cross-source
  dedup: the two sources never share a competition.
- **`scrape_targets` table** — the unit of work (source, url, kind, is_live,
  last_scraped_at); the poller reads/writes it, so "what to scrape next" is data, not code.
- **Migration path** — if Vercel's duration limit bites on big live events, move the
  poller body to an AWS Lambda on an EventBridge 1-min schedule, reusing the same
  `lib/scrapers` + `lib/ingest` code and writing to the same Neon DB.

## Resolved by discovery (docs/sources/*.md)

- **No JSON/AJAX live endpoint on mg-scoreboard** — HTML re-GET is the live source.
- **pmglivescore XML import is login-gated and unnecessary** — the `live-*` HTML carries
  scores, phases, heats and full rosters (`window.iscrittiGlobali`).
- **Participant is polymorphic** (team | individual | pair); roster visibility differs
  by source (mg teams/pairs opaque, no horses; pmg full rosters + ponies everywhere).
- **Final domain table shapes** are decided in `02-schema-stats` on top of this.
