# Ingestion Requirements

## Goal

Near-real-time collection of Mounted Games results from the two source portals,
normalized into our relational model, without hammering the sources and within Vercel's
function-duration limits.

## Prerequisite — Source Discovery (rev-eng) — DONE

The `rev-eng` agent documented both scraping contracts in `docs/sources/*.md`
(`mg-scoreboard.md`, `pmglivescore.md`). Confirmed facts that shape this spec:

- **Both sources are server-rendered HTML.** mg-scoreboard has **no** JSON/AJAX live
  feed (the "Refresh" button is a full page reload); pmglivescore's import XML is
  login-gated and **not needed** (the `live-*` HTML already carries everything). →
  Production ingestion is `fetch` + `cheerio` only; the "live" source is a periodic
  re-GET of the active event's views.
- **The participant is polymorphic across three formats** (see Normalization §4).
- **The two sources never cover the same competition** (mg = German/international,
  pmg = Italian national) → **no cross-source dedup/inference** is required.
- **No stable athlete/horse ids** on either source → identity is resolved by
  normalized name (case-fold + NFC + HTML-entity decode).

The finalized domain schema (`02-schema-stats`) builds on this discovery output.

## Core Flow

```
External scheduler (cron-job.org → POST /api/poll, CRON_SECRET)
  → live-window gate: any active competition now? if not, return immediately
  → pick the few stalest live scrape targets (bounded work per tick)
  → Scraper.fetch (AbortSignal timeout) → parse (cheerio) → normalized records
  → upsert into DB (idempotent, keyed on per-source IDs)
  → update target last_scraped_at
```

## Features

### 1. Scraper interface & registry
- Shared `Scraper` interface (fetch + parse → normalized records)
- One implementation per source, registered in a registry
- Parsing follows `docs/sources/*.md` exactly

### 2. Source scrapers
- `mg-scoreboard` — HTML only (no JSON/AJAX). Parse the event list/archive, the
  Toplist/standings, the Teams tab (the only place a `team_id` is exposed), and the
  per-session/final score tables. Send `Cookie: language=en`. The participant label
  shape depends on the event format (nation+category / rider name / pair label).
- `pmglivescore` — HTML only (import XML is login-gated and unnecessary). Enumerate
  events per format from wp-json (`squadre-cpt` / `individuali-cpt` / `coppie-cpt`,
  `id` = `post_id`); scrape the `live-*` views by `post_id`. Each `live-*` view embeds
  `window.iscrittiGlobali` (`{ "<label>": [{cognome, nome, pony}, …] }`) giving the
  full roster + horses behind every standings label.

### 3. Poller route (`/api/poll`)
- Bearer `CRON_SECRET` auth
- Live-window gating (return fast outside competitions)
- Bounded work per tick (N stalest live targets), per-fetch `AbortSignal` timeout
- Resilient: a slow/failed target is skipped and retried next tick

### 4. Normalization & upsert
- Map raw records to domain entities (competition / category / phase / heat /
  **participant** / result).
- **Polymorphic participant — three types, aligned to the competition format:**
  - `team` — a squad. On mg it is a **nation + age category** (`England U12`) with an
    **opaque/empty roster**; on pmg (`squadre-cpt`) it is a **club/team name** with a
    **full roster** (~5 riders + ponies). Roster cardinality: 0..N.
  - `individual` — a single **rider** (exactly 1 member). Named on both sources
    (mg Individual events; pmg `individuali-cpt`, label = surname).
  - `pair` — two riders. **Structured** on pmg (`coppie-cpt`, exactly 2 members +
    ponies); **opaque** on mg (free-text pair label, members not structured).
  - Common fields: `type`, raw `label`, `normalized_label`, `source`, per-source
    `native_id` (mg `team_id` / pmg `post_id`+label), optional `nation`, `category`.
    Members are riders (0/1/2/N) each optionally bound to a **horse/pony** (present on
    pmg, absent on mg).
- Attach scores to a participant by joining the score-row **label** to the participant
  within the same event/`post_id` (mg score rows carry no `team_id`; pmg labels need
  HTML-entity decode). This label-join is per-source and per-event only.
- Idempotent upserts keyed on stable **per-source** ids (mg `event id`/`team_id`,
  pmg `post_id` + normalized label).
- **No cross-source dedup** — the two sources never share a competition.

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
