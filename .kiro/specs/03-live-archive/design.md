# Live & Archive — Design

Front-end architecture for the read portal. Next.js App Router, Server Components by
default, `'use client'` only for the live-polling island. Tailwind + shadcn/Base UI with
the project's theme tokens.

## Chosen visual direction — Option C "Heritage equestre" (2026-08-11)

The picked mockup (`docs/mockups/03-live-archive/option-c.html`) is the visual spec.
Design tokens to port into the Tailwind theme (`app/globals.css`), light theme:

```
--green: #14532d;  --green-deep: #0e3a20;  --green-soft: #1f6b3c;   /* primary */
--cream: #f7f3e8;  --cream-deep: #efe8d5;  --white: #fffdf7;         /* surfaces */
--brass: #b8860b;  --brass-light: #d4a72c;                           /* accent */
--ink: #2a2416;    --ink-soft: #5c5442;    --line: #e2d9c2;          /* text/borders */
--live: #b91c1c;                                                     /* LIVE cue */
serif (display): "Spectral", Georgia, serif;   sans (body): "Inter", system-ui;
```

Signature elements: warm cream surfaces on racing-green chrome, brass accents, a
**rosette/ribbon motif for podium positions**, and the **drill-in scoreboard** (ranked
list → per-participant detail card with the per-game breakdown) as the mobile wide-grid
solution. A dark variant is derived later (05-polish); v1 ships the light heritage theme.

## Route map (App Router)

```
app/
├── page.tsx                         # Home (live-now + recent + search)  [server]
├── live/
│   └── [categoryId]/page.tsx        # Live scoreboard shell              [server]
│       └── (LiveScoreboard)         # client island, polls /api/live      [client]
├── competitions/
│   ├── page.tsx                     # Archive browse + filters           [server]
│   └── [competitionId]/page.tsx     # Competition → categories → phases   [server]
├── results/
│   └── [categoryId]/[phaseId]/page.tsx  # Static results view (archive)   [server]
├── athletes/[id]/page.tsx           # Athlete profile (first cut)         [server]
├── horses/[id]/page.tsx             # Horse profile                       [server]
├── teams/[id]/page.tsx              # Team profile                        [server]
├── nations/[code]/page.tsx          # Nation profile                      [server]
├── search/page.tsx                  # Search results                      [server]
└── api/live/[categoryId]/route.ts   # Standings JSON for polling          [handler]
```
Ids in URLs are our internal ids (not source native ids). `loading.tsx` + `error.tsx`
colocated per route; skeletons for the data-heavy views.

## Localization (next-intl)

All routes live under a `app/[locale]/…` segment; `next-intl` middleware handles
locale detection (`Accept-Language`) + prefixing, and provides messages to Server and
Client Components. Catalogs in `messages/{it,en}.json` (add `fr.json`/`de.json` to
extend — no code change). A `locales` const + typed keys keep usages checked. Only UI
chrome is in the catalogs; scraped data and canonical game names are rendered verbatim.
The `/api/live/[categoryId]` handler is locale-agnostic (returns data, not copy).

## Data flow

- **Server pages** import a small read layer `lib/queries/*` (Drizzle relational queries)
  and render directly — no client fetch. Cache with `revalidate` (archive/profiles can
  be ISR; competition pages short TTL).
- **Live island** (`components/features/live-scoreboard.tsx`, `'use client'`): initial
  data from the server shell, then `setInterval` re-fetch of `GET /api/live/[categoryId]`
  every ~12s (respecting `document.visibilityState` to pause when hidden). Shows a
  "LIVE • updated Xs ago" cue; falls back gracefully if a poll fails.
- `GET /api/live/[categoryId]` runs the same read query, returns standings + phases as
  JSON, `Cache-Control: s-maxage=10, stale-while-revalidate`.

## Read layer (`lib/queries/`)

Pure Drizzle query functions (unit-testable against the pglite harness like `upsert`):
- `getLiveCategories()` — categories whose competition has a live scrape_target.
- `getCategoryStandings(categoryId)` — participants + results (+ per-game) for a phase,
  ordered by rank; the shared shape behind the live island and the static results view.
- `listCompetitions(filter)` / `getCompetition(id)` — archive browse + drill-in.
- `getAthlete/Horse/Team/Nation(id)` — identity + participation history + headline stats
  (COUNT appearances, MIN(rank) best placement) via joins over participant_member/result.
- `search(term)` — normalized-name lookup across athlete/horse/team/competition.
Numeric columns cast to `number` via a shared `toNumber` helper at the query boundary.

## Component structure (per steering `nextjs.md`)

```
components/
├── ui/         # shadcn (untouched)
├── features/   # ScoreBoard, StandingsTable, GameGrid, EventCard, PhaseTabs,
│               #   EntityHeader, ParticipationList, SearchBox, LiveScoreboard(client)
└── layouts/    # TopBar, BottomNav (exist) — extend nav to Home/Live/Archive/Search
```
`StandingsTable` + `GameGrid` are format-aware (team | individual | pair) and drive both
live and archive results. Mobile presentation of the wide game grid is a mockup decision
(horizontal scroll vs expandable rows vs drill-in).

## Rendering & polling rules

- Server Components fetch data (no `useEffect` data-loading).
- Only `LiveScoreboard` is client; it polls **our** API, never the sources.
- `next/image`, `next/link`; dynamic import the live island if it grows heavy.
- Dark mode via the existing `class` strategy; all colors from theme tokens.

## Phasing (build order)

1. Read layer (`lib/queries`) + `/api/live/[categoryId]` + tests.
2. Results view + StandingsTable/GameGrid (the shared core), against a seeded pglite/DB.
3. Live scoreboard shell + client polling island.
4. Archive browse + competition drill-in.
5. Home (live-now + recent + search) and search page.
6. Entity pages (first cut).
Each user-visible surface: mockup → implement → screenshot evidence → usability review.

## Deferred / later specs

- Crowdsourcing UI → `04-crowdsourcing`. PWA/SEO/animation polish → `05-polish`.
- Advanced stats (head-to-head, per-game trends, rankings pages) → later slice.
- SSE/WebSocket live push → only if polling proves insufficient.

## Open (to mockups / user)

UI language (IT vs IT+EN), visual identity, home emphasis, mobile game-grid pattern,
bottom-nav set — see requirements "Open decisions". The chosen mockups become the visual
spec for implementation.
