# Ingestion Data Quality — Design

Implements `requirements.md`. Each section maps to a requirement (R1–R5) and names the
concrete files touched. Everything stays within the existing architecture (fetch +
cheerio scrapers → normalized records → idempotent upsert); the only schema change is one
nullable column on `scrape_target` to carry the mg date from discovery to persistence.

## R1 — Dates

### The threading problem (mg)
The mg **event page carries no date** — only the **list pages** do. So the date is known
at *discovery* time (`listEvents` / `listLiveEvents` / `refreshLiveWindow`), not at
*parse* time when the competition row is created. We carry it forward on the scrape
target.

- **Schema**: add `startsOn date` (nullable) to `scrape_target` in
  `db/models/ingestion.ts`. Generate migration `db/0003_*`.
- **Discovered target carries a date**: extend `DiscoveredTarget` in
  `lib/scrapers/types.ts` with optional `startsOn?: string` (ISO `YYYY-MM-DD`).
- **mg list parsers populate it**: in `lib/scrapers/mg-scoreboard.ts`, the archive and
  upcoming crawlers already visit the list DOM — capture the date next to each event id
  instead of discarding it:
  - Archive: for each `div.panel.panel-default`, read `panel-heading` → month + year
    (German month via a `DE_MONTHS` map, since the heading stays German even with
    `language=en`), and each `a.list-group-item`'s `span.badge` → day → `YYYY-MM-DD`.
  - Upcoming: parse the inline `D. Mon YY` (English abbrev month) on the link text.
  - `parseEventIds` becomes `parseEventEntries` returning `{ id, startsOn? }`;
    `listEvents` / `listLiveEvents` map those to `toplistTarget(id, startsOn)`.
- **syncTargets persists it**: `lib/ingest/discover.ts` writes `startsOn` onto the
  `scrape_target` row (only when provided; never clobber a set value with null).
- **Poller injects it**: in `lib/ingest/poll.ts` `processTargets`, when a target is the
  entry (`toplist`) kind, set `scrape.competition.startsOn = target.startsOn` before
  `persistScrape` (if the parsed scrape has none).
- **upsert honors it**: `resolveCompetition` in `lib/ingest/upsert.ts` already writes
  `startsOn: c.startsOn ?? null`; on the update path, fill it when previously null
  (do not overwrite a non-null value).

### pmg (inline)
pmg exposes the date on the page it already fetches. In `lib/scrapers/pmglivescore.ts`
`buildCompetition`, parse `live-info-gara` `Inizio`/`Fine` (or `.gara-date`) as
`DD/MM/YYYY` → set `startsOn` (+ `endsOn` when a range). Italian month names are not
needed (numeric dates). No threading required.

### Date helpers
Add `lib/ingest/dates.ts`: `parseGermanListDate(month, day, year)`,
`parseUpcomingDate("19. Aug 26")`, `parseItalianNumericDate("21/06/2026")`, all returning
ISO `YYYY-MM-DD` or `null`. Unit-tested in isolation.

## R2 — mg grouping + name

Rewrite the title normalization in `lib/scrapers/mg-scoreboard.ts`:

- **`stripCategorySuffixAndPrefix(title)`** removes age-band and format tokens from
  **both ends** (repeatably), covering: `U\s*\d+\s*[ab]?s?`, `Under \d+…`, `Open`, `OK`,
  `Pro`, `Reserve`, `Musketeers`, `25 ?& ?Over`, `Novice`, `Intermediate`,
  `Green ?Pony`, `Elite`, `Indice \d+`, and format words `Teams?`, `Individuals?`,
  `Pairs?`, `Squadre`, `Coppie`, `Individuali`, plus dangling separators (`-`, `–`,
  parentheses). The result is the **event base name**.
- **`buildCompetition(title, startsOn?)`**:
  - `name` = event base name (title minus bands/format).
  - `groupingKey` = `normalizeKey(baseName)` **+ the event year** (from `startsOn`, else a
    4-digit year found in the title, else none) → prevents "England Championships" 2024
    and 2025 from merging while still clustering same-year age bands.
  - `sourceTitleRaw` = verbatim title (unchanged).
- **`buildCategory`** keeps the raw per-event title as `label` (currently unset for mg),
  so the category still shows "U18" / "Open" verbatim; `ageBand`/`division`/`pro`
  parsing extended to handle **prefix** and **spaced** bands (`U 12`, `U 12 WPC 2026`).
- `resolveCompetition` already resolves by `(source, groupingKey)` select-then-insert, so
  a corrected, stable key is all that's required for the age bands to land on one row.

No change needed for pmg grouping (already correct).

## R3 — Level inference

Add `lib/ingest/level.ts` `inferLevel(title, source): CompetitionLevel | null`, applied in
both scrapers' `buildCompetition`. **Conservative, first-match-wins, default `null`:**

1. **international** — `/\b(IMGA|world|europ(e|ean|äisch)|WPC|WTC|home international|
   nations (cup|championship)|nordic|scandinav|internationa)\b/i`.
2. **national** — a country/federation marker **with** a championship word:
   `/\b(deutsche|einzelmeisterschaft|paarmeisterschaft|meisterschaft|championnat de
   france|british|england|scottish|welsh|irish|australian|swiss|schweizer|
   österreich|austrian|NZ|new zealand)\b/i` **and**
   `/\b(champ|championship|meisterschaft|championnat|nationa)\b/i`.
3. **regional** — state/series/ranking markers:
   `/\b(RLT|MGAWA|MGANSW|AMGA ?VIC|AMGANSW|state|county|counties|midlands|southern|
   winter|autumn|spring|summer) series?\b/i`, `/\bRLT\b/`, `/\bintercounties\b/i`.
4. **club** — local/friendly: `/\b(club|friendly|starter|development|snowbird|trophy|
   cup|show)\b/i` **only if** none of the above matched (weak signal).
5. Otherwise `null` (unknown) — the UI simply omits the badge.

pmg is effectively single-level (Italian national circuit); map obvious
`CAMPIONATI ITALIANI` → `national`, else `null`.

The rule table lives in `level.ts` as ordered `[regex, level]` pairs so it is testable and
easy to extend; document that it is heuristic and the residual is a future crowdsourcing
target.

## R4 — Recent-result navigation fix

- `lib/queries/home.ts`: add `competitionId: number` to `RecentResultRow`; select
  `competition.id` in `getRecentResults`.
- `components/features/recent-result-item.tsx`: link to
  `/competitions/${result.competitionId}` (was `${result.categoryId}`). Keep
  `categoryId` only if a future "jump straight to that category's live view" is wanted.
- Verify the Live card (`home-live-card.tsx`) already links `/live/{categoryId}`
  (correct) — no change.

## R5 — Backfill

Corrected `groupingKey` changes competition identity, so re-scraping over the current DB
would create new (correct) competitions beside the old (wrong) ones. Chosen strategy for a
pre-launch project with **reproducible scraped data**:

1. **Reset the scraped domain tables** (competition → category → phase → heat →
   participant/participant_member → result/game_result → source_ref → scrape_target),
   leaving reference tables (nation) and auth intact. Provide it as an explicit,
   guarded maintenance route `POST /api/admin/reset` (CRON_SECRET, refuses unless an
   extra `?confirm=1`) **or** a one-off `npm run db:reset-scraped` script — never
   automatic. This is destructive and requires the user's go-ahead each time.
2. **Re-seed** (`POST /api/seed`) to rediscover events **with dates**, then let the
   live + archive crons repopulate with correct grouping/level.

Alternative (non-destructive) if preferred: a one-off migration script that recomputes
`groupingKey`/`name`/`startsOn`/`level` from `sourceTitleRaw` in place and merges
duplicate competitions — more code, kept as a fallback if a reset is undesirable later.

## Testing

Fixtures under `lib/scrapers/__fixtures__/` (Biome-ignored, already the convention):
- `lib/ingest/dates.test.ts` — German list date, upcoming `D. Mon YY`, pmg `DD/MM/YYYY`,
  invalid inputs → null.
- `lib/scrapers/mg-scoreboard.grouping.test.ts` — base-name + groupingKey for: suffix
  band (`… - U18`), prefix band (`U 12 WPC 2026`), format word (`… Open Individuals`),
  `Reserve Individuals`, cross-year non-merge, same-event same-year merge.
- `lib/ingest/level.test.ts` — one case per rule tier + an ambiguous `null` case.
- Extend `lib/queries/read-layer.test.ts` — `getRecentResults` returns `competitionId`
  pointing at the category's parent competition.
- Extend `lib/ingest/upsert.test.ts` — `startsOn` is written on insert and filled on the
  update path when previously null (not overwritten when already set).

## Work breakdown (suggested order)

1. **R4** recent-result link fix (isolated correctness; smallest, shippable alone).
2. **R1** dates: `dates.ts` + `scrape_target.startsOn` migration + mg list capture +
   threading + pmg inline + upsert fill.
3. **R2** grouping/name rewrite + `buildCategory` label/band changes.
4. **R3** level inference.
5. **R5** guarded reset route/script + re-seed; run backfill on the user's confirmation.
6. Verify live: dates render, ordering chronological, multi-band events grouped, level
   badges present, recent-result links correct.

## Risks / notes

- **German month heading** is the one locale quirk (stays German under `language=en`);
  the `DE_MONTHS` map must be complete. If a heading format changes, dates degrade to
  `null` (graceful — ordering falls back, no crash).
- **Grouping over-merge**: including the year in the key guards the common case; residual
  edge cases (same name, same year, genuinely different events) are acceptable and
  crowdsourcing-correctable later.
- **Reset is destructive**: gated behind explicit confirmation; scraped data is
  reproducible from the sources, auth/reference data is preserved.
