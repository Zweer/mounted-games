# Schema & Stats Requirements

## Goal

Define the **domain relational schema** the ingester writes into and the frontend/stats
read from. It must faithfully hold both sources despite their asymmetry, resolve
cross-event identity by normalized name (no stable source ids for people/horses), and
make athlete/horse/team/nation statistics expressible as **joins/aggregations** — the
value-add the two source portals lack.

## Inputs (from discovery — `docs/sources/*.md`)

- **Polymorphic participant, 3 types aligned to format:** `team` | `individual` |
  `pair`. Roster cardinality: team 0..N, individual 1, pair 2.
- **Asymmetric anagraphics:**
  - mg-scoreboard: native `team_id` per participant in every format; **rosters opaque**
    for team/pair, riders named only for individuals, **horses never shown**.
  - pmglivescore: full roster + **pony** for every format via `window.iscrittiGlobali`
    (`{ "<label>": [{cognome, nome, pony}, …] }`), keyed by `post_id`.
- **No stable ids** for athlete/horse/team/venue on either source → identity by
  normalized name (case-fold + NFC + HTML-entity decode).
- **Sources never overlap** on the same competition → no cross-source merge.
- Scores may be **decimal**; games are named strings (English on mg, Italian on pmg).

## Scope — entities to model

1. **Reference:** `source`, `nation`, `game` (+ per-source name aliases), `venue`.
2. **Competition hierarchy:** `competition` → `category` (format × age band) → `phase`
   (session/semifinal/final) → `heat`.
3. **Participants & identity:** `participant` (polymorphic) with per-source native ids;
   `athlete`, `horse` (name-resolved identities); `participant_member` roster link
   (athlete + optional horse) with **provenance** (scraped | crowdsourced).
4. **Results:** per-participant per-phase/heat totals (+ penalty, rank) and per-game
   breakdown.
5. **Ingestion bookkeeping:** `scrape_target` (from 01-ingestion) + a raw/native-id map
   so re-scrapes are idempotent.
6. **Crowdsourcing hooks:** a generic `contribution` queue (registration+approval from
   00-setup roles) to fill opaque mg rosters/horses and to merge misresolved identities.
   (Full crowdsourcing workflow is a later spec; here we only reserve the schema hooks.)

## Success Criteria

- Every record shape in `docs/sources/*.md` (all 3 formats × both sources) maps onto the
  schema with no data loss and no source-specific columns leaking into the domain.
- Re-running ingestion is idempotent (native-id + normalized-label upserts).
- The headline stats are expressible as SQL over the schema **without** schema changes:
  athlete win/points history, horse (pony) history, team/nation medal & points tables,
  head-to-head, per-game performance.
- Schema stays **vendor-neutral Postgres** (portable off Neon) and Drizzle-native.

## Non-Goals

- No scraper/poller code (that's 01-ingestion implementation).
- No stats UI or API endpoints (later frontend spec) — only the schema that enables them.
- No realtime tables (client polls our API; realtime deferred).
- No full crowdsourcing moderation flow (later spec) — only the `contribution` hook here.
