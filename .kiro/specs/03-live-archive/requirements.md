# Live & Archive — Requirements

## Goal

The **read-side portal**: a mobile-first, fast, visually striking UI over the data the
ingestion pipeline lands in Neon — a near-real-time **live scoreboard** during
competitions and a browsable **results archive**, plus first-cut **entity pages**
(athlete / horse / team / nation). This is the phase that makes the project *visible*.

Visual identity (palette, typography, card style, logo) is intentionally **not** fixed
here — it is decided in the mockup step (frontend-design-workflow Phase 1). This spec
fixes scope, information architecture, data flow and the read-API contract.

## Inputs (already built)

- Domain schema (`db/models/*`, 22 tables): competition → category → phase → heat →
  participant (team|individual|pair) → result/game_result, + athlete/horse/team/nation.
- Ingestion writes it autonomously (source-driven live window). No official API.
- Live delivery model (steering `nextjs.md`): **client polls our own API every ~10-15s**
  on live views; everything else is server-rendered. No WebSocket/SSE in v1.

## Scope (v1 of the portal)

1. **Home** — surfaces live-now competitions (when any are live), recent results, and a
   search entry. Empty/off-season state is a first-class design (often nothing is live).
2. **Live event** — the scoreboard for an active category: standings + phase navigation
   (session/semifinal/final), auto-refreshing, with a clear "LIVE" indicator and
   last-updated time. Must render all three formats (team / individual / pair).
3. **Archive & competition browse** — list/filter past competitions (by date, nation,
   format, category); competition → its categories → phases → results.
4. **Results view** — the standings + per-game breakdown table, shared by live and
   archive (live just auto-polls it). Mobile-first presentation of a wide game grid.
5. **Entity pages (first cut)** — athlete, horse, team, nation: identity header +
   participation history + a few headline stats (appearances, best placements). Deep
   stats (head-to-head, per-game trends) are deferred to a later slice.
6. **Search** — by athlete / horse / team / competition name (normalized-name lookup).

## Localization (decided)

- **Ship IT + EN**; architecture **extensible to N locales** with **`next-intl`**
  (locale-prefixed routes `/[locale]/…`, message catalogs `messages/{it,en}.json`).
  **FR and DE are drop-in** later (add a catalog file, no re-architecture) and may
  eventually be crowdsourced.
- Translate only the **UI chrome** (labels, empty states, messages). **Scraped data**
  (athlete/horse/team names, competition titles) is left as-is (proper nouns); **game
  names** are normalized to one canonical vocabulary, not "translated" per locale.
- Default locale IT; EN available via a language switcher; `Accept-Language` for the
  first visit. All mockups are shown bilingual IT/EN.

## Read-API contract

- **Server Components read Neon directly** for home, archive, competition, results and
  entity pages (SSR; cache/ISR where safe). No client fetching for these.
- **Live views poll a Route Handler**: `GET /api/live/...` returns the current standings
  JSON for one category; a client component re-fetches every ~10-15s. Public, read-only,
  cacheable with a short TTL. (Never poll the third-party sources from the client.)
- All inputs validated with Zod; numeric scores rendered from `numeric` via a shared
  cast helper.

## Success Criteria

- A live category shows current standings and auto-updates within the poll interval,
  for all three formats, with a visible live/last-updated cue.
- Archive is navigable competition → category → phase → results with working filters.
- Entity pages resolve by our internal id and list real participation history.
- Mobile-first: usable one-handed on a phone; passes a first-run usability review;
  accessible (labels, contrast, focus). Dark mode works (class strategy already set).
- Typecheck / lint / tests green; the built UI matches the chosen mockups.

## Non-Goals (this spec)

- Crowdsourcing UI (registration/approval/edit) — that's `04-crowdsourcing`.
- PWA install, SEO/metadata polish, animations pass — that's `05-polish`.
- Deep/advanced statistics and head-to-head — a later slice.
- Real-time push (SSE/WebSocket) — client polling only in v1.
- Admin/live-window controls — the live window is source-driven and automatic.

## Open decisions (resolve before/with mockups)

- **Visual identity**: palette, typography, logo/wordmark, card style, "LIVE" treatment
  — decided via 2-3 mockups.
- **Home emphasis**: live-first hero vs. a results feed when nothing is live.
- **Scoreboard on mobile**: how to present a wide per-game grid (horizontal scroll,
  expandable rows, or per-participant drill-in) across team/individual/pair.
- **Navigation model**: bottom-tab set (Home / Live / Archive / Search / …) — the
  scaffold already has a `BottomNav` to build on.
