# Ingestion Data Quality — Requirements

## Goal

Make the portal's data **readable and correct**. The read UI (`03-live-archive`) and the
domain schema (`02-schema-stats`) are complete and sound, but the live site looks like
"a mess": undated competitions in a seemingly random order, age bands not grouped under
their event, a broken drill-in link, and no competition level. This phase closes the gap
between what the UI already renders and what ingestion actually populates. **No UI
redesign and no schema migration for dates/level are needed** — those columns already
exist and the queries already read them; they are simply never filled.

## Context — confirmed findings (2026-08-18 audit)

- **Schema already has the fields.** `competition.startsOn`, `endsOn`, `level`
  (enum `club|regional|national|international`), `nationId`, `groupingKey`,
  `sourceTitleRaw` all exist in `db/models/competition.ts`; the read queries in
  `lib/queries/competitions.ts` and `lib/queries/home.ts` already select and render
  them. They are `NULL` because ingestion never writes them.
- **Dates exist in the sources but are discarded.**
  - mg-scoreboard: the **event page has no date**; the date lives in the **list pages**
    — archive month panel heading (German month + full year, e.g. `August 2026`) plus a
    `span.badge` day on each event link (→ `2026-08-10`), and the upcoming list inline
    (`19. Aug 26`). `listEvents` / `parseEventIds` collect only the id and throw the date
    away.
  - pmglivescore: date is on the competition page / cards (`.gara-date`,
    `live-info-gara` `Inizio`/`Fine`, `DD/MM/YYYY`) — parseable inline; not extracted
    today.
- **mg grouping is broken; pmg grouping already works.** pmg keeps the age band in a
  separate badge, so `groupingKey = normalizeKey(title)` clusters all age bands of one
  event correctly. mg bakes the age band **into** the title and
  `groupingKeyFromTitle` only strips a narrow trailing token set — it fails on prefix
  bands (`U 12 WPC 2026`), spaced bands (`U 12`), and non-listed suffixes (`Reserve
  Individuals`, `Individuals`, `Musketeers`, `25 & Over`, `Novice`, …).
- **The competition name carries an age band.** mg `buildCompetition` uses the full
  title (`… - U18`) as the competition `name`, even when it groups Open + U18 + … under
  one competition — misleading in the archive and detail header.
- **The "click Open → land on U15" symptom is a navigation bug, not grouping.** The Home
  "Recent results" card links to `/competitions/{categoryId}`, but the detail route
  resolves by `competition.id`. `category.id` and `competition.id` are independent
  sequences, so the link lands on an unrelated competition.
- **No parent `event` table is needed.** The two sources never cover the same event, so
  there is no cross-source grouping requirement; `competition` already *is* the event
  weekend. Fixing grouping + name is sufficient.
- **`level` is inference-only** on both sources (no explicit field); infer conservatively
  from the title, leave `NULL` when unsure.

## Scope

### R1 — Competition dates populated
- Every competition gets a `startsOn` when the source exposes one; `endsOn` when a range
  is available.
- **mg**: capture the date at discovery (list crawl) and carry it to the competition the
  toplist page creates (the event page itself has no date).
- **pmg**: parse the date inline from the competition/live view.
- Acceptance: after a re-ingest, `competition.startsOn` is non-null for events present in
  the mg archive/upcoming lists and for pmg competitions; the Home "Recent results" and
  the Archive are ordered **chronologically** (most recent first), not by insertion id.

### R2 — mg grouping + name corrected
- All age bands of one real mg event cluster under a **single** competition with N
  categories (e.g. World Team Championships 2026 → U18 + Open + Reserve).
- `competition.name` is the **event name without the age band / format suffix**
  (`World Team Championships 2026`); the per-band string stays on `category.label`;
  `sourceTitleRaw` keeps the verbatim title.
- `groupingKey` normalization strips leading **and** trailing age-band and format tokens,
  handles spaced/prefixed bands, and (to avoid merging same-named events across years)
  incorporates the event year.
- Acceptance: the archive no longer shows one row per age band for a multi-band event;
  opening such an event lists all its categories; distinct years/events do not merge.

### R3 — Competition level inferred
- Infer `level` (`international` | `national` | `regional` | `club`) from the title using
  a documented keyword ruleset; leave `NULL` when not confident (never guess).
- Acceptance: IMGA / World / European / WPC / WTC events resolve to `international`;
  national-championship titles to `national`; local series / RLT / state comps to
  `regional`/`club`; ambiguous titles stay `NULL`. The UI shows a level badge when set.

### R4 — Recent-result navigation bug fixed
- `getRecentResults` returns the parent `competitionId`; the Home recent-result card
  links to `/competitions/{competitionId}`.
- Acceptance: clicking any Home "Recent results" card lands on the correct competition
  whose categories include the one shown on the card.

### R5 — Backfill of existing data
- Re-populate already-ingested rows with the corrected dates / grouping / level / name.
- Because R2 changes competition identity (`groupingKey`), a naive re-scrape would create
  correctly-grouped competitions **alongside** the old mis-grouped ones. The backfill
  therefore requires either a clean reset of the scraped domain tables + re-seed, or a
  one-off re-group migration. This is a **destructive data operation** on scraped
  (reproducible) data and must be confirmed before running.
- Acceptance: after backfill the live site reflects the corrected data with no duplicate
  competitions.

## Success Criteria

- Home and Archive are ordered chronologically; dates render on cards and detail headers.
- A multi-band mg event appears as one competition with all its categories; the name has
  no age-band suffix.
- Recent-result cards navigate to the correct competition.
- Level badges appear for confidently-classified events.
- Unit tests (fixtures) cover: mg date parsing (archive month panel + badge day; upcoming
  `D. Mon YY`), pmg date parsing (`DD/MM/YYYY`), `groupingKey` (prefix/suffix/format/year
  cases), level inference (keyword table), and the read-layer `competitionId` on recent
  results. Typecheck / lint / tests green.

## Non-Goals

- No new `event` parent table (sources never overlap; `competition` is the event).
- No `competition_level` enum change (existing 4 values are sufficient).
- No UI redesign — only the recent-result link fix and rendering fields already wired.
- No archive IA overhaul (year→event grouping surface, richer filters, entity
  chronology) — that is a **follow-up UI slice** enabled by these data fixes, tracked
  separately.
- No venue/organizer extraction, no crowdsourced corrections (that is `05-crowdsourcing`).
