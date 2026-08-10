# Schema & Stats Design

Concrete relational model for the Drizzle schema (vendor-neutral Postgres).
Notation is Drizzle-oriented pseudo-schema; final column types tightened at
implementation. Auth tables (`user`/`session`/`account`/`verification` with
`user.role`/`user.status`) already exist from 00-setup and are not repeated here.

**File organization (implemented).** One file per domain under `db/models/*.ts`
(`enums`, `auth`, `reference`, `competition`, `participant`, `result`, `ingestion`,
`crowdsource`); the Drizzle relation graph is centralized in `db/relations.ts` (not
colocated, to avoid ESM module cycles from bidirectional cross-domain relations —
foreign keys stay on the table definitions). `db/schema.ts` is a barrel re-exporting
every model + relations, so the entry point for drizzle-kit, `@/db` and the Better
Auth adapter stays `@/db/schema`.

## Design principles

1. **Domain is source-agnostic.** No `mg_`/`pmg_` columns in domain tables. Everything
   source-specific is captured in `source_ref` (native-id map) and in provenance flags.
2. **Participant is polymorphic by `type`** (`team` | `individual` | `pair`), not by
   separate tables. Roster differences (opaque vs full) are represented by how many
   `participant_member` rows exist and their `provenance`, never by the type.
3. **Identity by normalized name.** `athlete`/`horse`/`team`/`nation` carry a
   `normalized_name` unique key; raw source strings are preserved for audit and merge.
4. **Scores at two grains.** `result` = per-participant per-phase(/heat) totals;
   `game_result` = per-game breakdown. Both decimal-capable.
5. **Idempotent ingestion.** Every scraped row resolves to a domain row via `source_ref`
   (native id) or normalized label; re-scrape updates in place.

## Enums

```
sourceKind      = ['mg-scoreboard', 'pmglivescore']
competitionLevel= ['club', 'regional', 'national', 'international']   -- best-effort
categoryFormat  = ['team', 'individual', 'pair']
participantType = ['team', 'individual', 'pair']                     -- mirrors format
phaseKind       = ['session', 'semifinal', 'final']
provenance      = ['scraped', 'crowdsourced', 'merged']
contribStatus   = ['pending', 'approved', 'rejected']
contribTarget   = ['participant_member', 'athlete', 'horse', 'participant', 'identity_merge']
```

## Entity-relationship overview

```
nation ──< team                       venue ──< competition
  │          │                                     │
  └──< athlete                                     └──< category ──< phase ──< heat
             │  (format, age_band)                        │           │
horse        │                                            │           └──< result >── participant
  │          │                                            │                   │  (type)
  └──< participant_member >── athlete                     └──< participant ────┘
             │  (+ optional horse, provenance)                    │
             └── result ──< game_result >── game                  └──< source_ref (native ids)
```

## Tables

### Reference

**nation** — `id`, `code` (ISO2 / `_england` home-nation token, unique), `name`.
Seeded from mg flag filenames; pmg is implicitly Italy.

**game** — `id`, `canonical_name`, `normalized_name` (unique). The join key for
per-game stats. Because names differ by source/locale (mg English, pmg Italian via
`acfGiocoLabels`), aliases live in:

**game_alias** — `id`, `game_id → game`, `source` (sourceKind), `raw_name`,
`normalized_name`; unique `(source, normalized_name)`. The ingester resolves a raw
game header to a `game_id` via alias, creating the alias (and game) on first sight.

**venue** — `id`, `name`, `normalized_name` (unique), `nation_id?`. Sparse (mg venue
metadata is thin); nullable everywhere it is referenced.

### Competition hierarchy

**competition** — `id`, `name`, `normalized_name`, `level` (competitionLevel),
`nation_id?`, `venue_id?`, `starts_on?`, `ends_on?`, `organizer?`, `source` (sourceKind).
Grouping rule: pmg groups its category posts by shared `title.rendered`; mg groups event
ids by title prefix (suffix like `- Under 12a` stripped). Grouping is best-effort — a
`category` can exist with a thin/auto-created `competition`.
Index: `(source, normalized_name)`.

**category** — `id`, `competition_id → competition`, `format` (categoryFormat),
`age_band?` (normalized controlled set: `OPEN` | `U12` | `U15` | `U18`; unknown values
kept verbatim-normalized, not a hard `pgEnum`, so a new band never needs a migration),
`pro` (bool, default `false` — the PRO tier is orthogonal to the band: `U12 PRO` →
`age_band='U12', pro=true`), `division?` (char `a`/`b` for `12a`/`12b`-style splits),
`label` (raw, e.g. `Under 12a`), `source` (sourceKind). **This is the scraping unit**
(one mg event id = one category; one pmg CPT post = one category). Its native id lives
in `source_ref`. Unique-ish grouping: `(competition_id, format, age_band, pro,
coalesce(division))`. Index: `(competition_id)`, `(format)`.

**phase** — `id`, `category_id → category`, `kind` (phaseKind), `ordinal` (int, sort),
`label` (e.g. `Session 2`, `Final A`, `Semifinal`), `native_params` (jsonb: e.g.
`{session:2}` or `{final:'A',heat:1}` mg / pmg `live-*` slug). Unique
`(category_id, kind, ordinal)`.

**heat** — `id`, `phase_id → phase`, `number` (int). Optional grain: individual/pairs
sessions split into heats (mg `### Heat n`, pmg `batteria`). Results may reference a
heat or attach directly to the phase (`heat_id` nullable on `result`).

### Participants & identity

**team** — `id`, `name` (raw label as-seen for team-type participants), `normalized_name`
(unique per nation), `nation_id?`, `is_club` (bool: pmg club vs mg nation-team). Only
used by `participant.type = 'team'`. mg nation-teams and pmg clubs both live here;
`is_club` distinguishes. (A nation-team like `England U12` normalizes to nation England;
the age band is on the category, not the team.)

**athlete** — `id`, `family_name`, `given_name?`, `normalized_name` (unique),
`nation_id?`. Identity resolved by `normalized_name`. Note the pmg-individuali risk:
label = surname only → possible collisions; see Identity Resolution.

**horse** — `id`, `name`, `normalized_name` (unique). pmg only in practice (mg never
shows horses). Nullable wherever referenced.

**participant** — `id`, `category_id → category`, `type` (participantType),
`label` (raw, e.g. `England U12` / `Chloe LORENZON` / `BENJ ET AUDE`),
`normalized_label`, `team_id?` (when `type='team'`), `athlete_id?` (fast path when
`type='individual'`), `nation_id?`, `start_number?` (int, mg individual/pairs).
Unique `(category_id, normalized_label)`. Native id (mg `team_id`) in `source_ref`.

**participant_member** — `id`, `participant_id → participant`, `athlete_id → athlete`,
`horse_id? → horse`, `role?` (nullable; future), `provenance` (provenance).
The roster link — the crux of the design:
- individual → exactly 1 row (scraped both sources);
- pair → 2 rows (scraped on pmg; **crowdsourced** on mg — 0 rows until filled);
- team → N rows (scraped on pmg; **crowdsourced** on mg — 0 rows until filled).
Unique `(participant_id, athlete_id)`. `provenance` lets the UI mark contributed data
and lets moderation revert it.

### Results

**result** — `id`, `participant_id → participant`, `phase_id → phase`, `heat_id? → heat`,
`points_total` (numeric), `penalty_points?` (numeric; mg pairs), `rank?` (int),
`is_tie?` (bool; pmg `*` marker). Unique `(participant_id, phase_id, coalesce(heat_id))`.

**game_result** — `id`, `result_id → result`, `game_id → game`, `points` (numeric),
`ordinal` (int; column order in the source table). Unique `(result_id, game_id)`.

### Ingestion bookkeeping

**source_ref** — `id`, `source` (sourceKind), `entity_type` (`competition`|`category`|
`participant`), `entity_id` (fk-by-type), `native_id` (text: mg event id / mg `team_id`
/ pmg `post_id`), `native_url?`. Unique `(source, entity_type, native_id)`. This is the
idempotency anchor for re-scrapes and keeps native ids out of domain tables.

**scrape_target** — as defined in 01-ingestion (`source`, `url`, `kind`, `category_id?`,
`is_live`, `last_scraped_at`). Lives with the domain schema; the poller reads/writes it.

### Crowdsourcing hook (schema only; workflow is a later spec)

**contribution** — `id`, `user_id → user`, `target` (contribTarget), `target_id?`
(existing row being edited/merged), `payload` (jsonb: proposed member/athlete/horse or
merge pair), `status` (contribStatus), `reviewed_by? → user`, `created_at`,
`reviewed_at?`. Approval writes domain rows with `provenance='crowdsourced'` and links
back via `source_ref`-style audit. Enables filling mg opaque rosters/horses and merging
misresolved identities.

## Identity resolution strategy

- **Normalization function** (shared `lib`): trim → NFC → HTML-entity decode →
  case-fold → collapse internal whitespace → straighten curly apostrophes/quotes. Used
  to compute every `normalized_name`/`normalized_label`.
- **Athlete match:** by `normalized_name`. pmg gives `cognome`+`nome` (good key); mg
  individual gives a full display name (also good). **pmg individuali labels are surname
  only** → resolve against `family_name`; on ambiguity, do NOT auto-merge — create a
  distinct athlete and flag for a `identity_merge` contribution.
- **Horse match:** by `normalized_name` (pmg only).
- **Team match:** nation-teams by `nation_id` (age band on category); clubs by
  `normalized_name`. `is_club` prevents merging a club with a nation-team.
- **Never merge across sources automatically** (they don't share events); merges are a
  deliberate crowdsourced/admin action.

## How statistics are derived (no extra base tables in v1)

All headline stats are **queries/aggregations** over the schema; optionally cached in
materialized views refreshed after ingestion. Examples:
- **Athlete profile:** join `athlete → participant_member → participant → result` →
  events, placements, points over time, per-`game` averages via `game_result`.
- **Horse (pony) profile:** same via `horse_id` on `participant_member` (pmg).
- **Team/Nation tables:** aggregate `result.rank`/`points_total` grouped by `team`/
  `nation` and `category.format` (medals, points, appearances).
- **Head-to-head & per-game:** `game_result` joined across two participants/athletes.
Deferred optimization: `ranking_snapshot` cache table if live queries get heavy.

## Resolved decisions (v1)

1. **Competition grouping — lazy, best-effort.** Always create the `category`; attach it
   to a `competition` via a normalized `grouping_key` (pmg: `title.rendered`; mg: title
   with the trailing age/category suffix stripped). If the match is uncertain, the
   category owns a thin 1:1 competition. The raw source title is stored on the category
   for later re-grouping/merge. **Ingestion never blocks on grouping** — it is a
   presentation concern, not a correctness one.
2. **Age band — controlled set + orthogonal PRO + division.** `age_band` normalized to
   `OPEN`/`U12`/`U15`/`U18` (text, not a hard enum; unknowns kept normalized). PRO is a
   separate `pro` boolean (`U18 PRO` → `age_band='U18', pro=true`), and `12a`/`12b`
   splits go to `division`. Stats group by `(age_band, pro)`.
3. **`phase.native_params` — jsonb.** Ingestion-only metadata to rebuild the source
   URL/phase; never queried. Queryable/sortable bits stay as real columns (`kind`,
   `ordinal`, `label`).
4. **Scores — `numeric(6,2)`.** Decimal scores are summed/averaged for stats, so
   exactness matters (no float drift). Read layer casts the Drizzle string back to
   number via a shared helper.
5. **Home nations — first-class `nation` rows.** `_england`/`_scotland`/`_wales` seed
   their own nation rows (codes `england`/`scotland`/`wales`); normal ISO2 codes map as
   usual. They compete as distinct nations in MG, so no merge into a `GB` parent in v1.

## Deferred / to revisit later

- Materialized-view or `ranking_snapshot` cache tables — only if live stats queries get
  heavy; base schema already supports every headline stat as a plain query.
- Full crowdsourcing moderation workflow (beyond the `contribution` hook) — later spec.
