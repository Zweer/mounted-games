# pmglivescore.altervista.org — Scraping Contract

## Overview

- **Tech:** WordPress on Altervista (Apache + Varnish). Theme `phlox`, page builder
  **Elementor**, SEO by **Yoast**, custom domain logic in a first-party plugin
  **`my-custom-logic`** (`/wp-content/plugins/my-custom-logic/…`, `ver=3.10.37` at
  discovery time).
- **Rendering model:** **fully server-rendered HTML**. All data views (competition
  page, live standings, batteria, timetable, iscritti) arrive complete in the initial
  GET response. The plugin JS (`live-batteria.js`, `iscritti-popover.js`,
  `timetable.js`, …) only enhances the already-rendered DOM (sorting, popovers,
  responsive labels) — it does **not** fetch data. → **`fetch` + `cheerio` is fully
  sufficient; no Playwright needed in production.**
- **Live path:** there is **no** client-side polling, WebSocket, SSE, or JSON/AJAX
  data feed. "Live" pages are ordinary pages whose HTML reflects current state; to
  follow a live competition we **re-GET the page** on our poll interval. Phase state
  is encoded in CSS classes (`stato-programmata` / `stato-in_corso` / `stato-conclusa`).
- **Caching:** Varnish in front (`via: … Varnish`), but competition/live pages return
  `cache-control: no-cache, no-store` and `av-cache: UNCACHEABLE`, so re-GETs during a
  live window get fresh HTML.
- **robots.txt:** permissive — `Disallow:` (empty) for all agents; only
  `/wp-content/uploads/wpo/wpo-plugins-tables-list.json` is disallowed. Sitemap at
  `/sitemap_index.xml`. Our target pages are **not** disallowed.
- **Politeness:** small, national-scope site on shared hosting. Use a descriptive
  User-Agent, keep concurrency at 1, add delays (≥1–2 s) between requests, and only
  poll live pages during active competition windows. GET-only; never touch the
  admin/import forms.

## URL Patterns

| Purpose | URL template | Notes |
|---|---|---|
| Home / competition list | `https://pmglivescore.altervista.org/` | Cards, server-rendered |
| Competition detail | `/competizione/?competizione=<ENCODED_NAME>` | Keyed by the **name** (see Entities) |
| Live event info | `/live-info-gara/?post_id=<POST_ID>` | **format-agnostic** metadata view (venue, dates, phase config, per-phase state) — see Data Views §6 |
| Live general standings | `/live-classifica-generale/?post_id=<POST_ID>` | Per-category standings (primary results view). Columns vary by format — see Per-Format Breakdown |
| Live session heat | `/live-sessione<S>-batteria<B>/?post_id=<POST_ID>` | **CONFIRMED shape** — `<S>`=session 1‑3, `<B>`=heat number (observed `batteria1`, `batteria2`, `batteria5`). The nav's "Sessione N" link points at `live-sessione<S>-batteria5`. NOT `live-batteria<N>` |
| Live session games | `/live-sessione1-giochi/?post_id=<POST_ID>` | "Giochi" nav item — the games list for a session |
| Live semifinal (English) | `/live-semifinale-inglese/?post_id=<POST_ID>` | phase-specific view; "Inglese" is the semifinal *type* (see `live-info-gara` `Semifinale` field) |
| Live final A | `/live-finale-a/?post_id=<POST_ID>` | phase-specific view; final type `(A)`/`(B)` also shown in the standings `col-finale` cell. `live-finale-b` still unconfirmed |
| Registered participants | `/live-iscritti-<format>/?post_id=<POST_ID>` | **canonical slug** used by the nav: `live-iscritti-squadre` / `live-iscritti-individuali` / `live-iscritti-coppie`. Carries `window.iscrittiGlobali` (roster). The un-prefixed `/iscritti-<format>/` alias also resolves. `<format>` MUST match the CPT type of the `post_id` |
| REST: pairs entries | `/wp-json/wp/v2/coppie-cpt?per_page=100&page=<n>` | list only, **no scores** (see REST section) |
| REST: teams entries | `/wp-json/wp/v2/squadre-cpt` | " |
| REST: individuals entries | `/wp-json/wp/v2/individuali-cpt` | " |
| Sitemaps (enumerate all) | `/coppie-cpt-sitemap.xml`, `/squadre-cpt-sitemap.xml`, `/individuali-cpt-sitemap.xml` | canonical CPT permalinks |
| CPT permalink (login-gated) | `/coppie-cpt/<slug>/` | **redirects to `wp-login.php`** for anonymous — do NOT use; use the `live-*` views instead |
| XML import form | `/importa-xml/` | **login-gated** ("Accesso negato"); admin-only, no anonymous access |

Notes:
- The card / phase-table links use `data-url` on the `.gara-item` element and an inner
  `<a>`; the live views use the numeric `post_id` (the WordPress post id of the
  CPT entry for that category), **not** the competition name.
- `live-batteria<N>` — the `<N>` suffix is dynamic (observed `batteria5`); derive the
  set of phase view links by scraping the anchors on the competition / standings page
  rather than hardcoding them.

## REST API (WordPress wp/v2)

`/wp-json/` is **open**. The competition data lives in three custom post types, all
exposed via REST:

- `coppie-cpt` → `/wp-json/wp/v2/coppie-cpt` (Pairs)
- `individuali-cpt` → `/wp-json/wp/v2/individuali-cpt` (Individuals)
- `squadre-cpt` → `/wp-json/wp/v2/squadre-cpt` (Teams)

Each CPT post = **one category within one competition** (e.g. slug
`3a-tappa-trofeo-federale-mounted-games-8`). Useful fields per entry:

| Field | Example | Use |
|---|---|---|
| `id` | `48397` | **This is the `post_id`** used by every `live-*` view |
| `slug` | `3a-tappa-trofeo-federale-mounted-games-8` | stable per-category id |
| `title.rendered` | `3ª TAPPA TROFEO FEDERALE MOUNTED GAMES` | competition name (shared across its categories) |
| `date` / `modified` | `2026-06-19T18:20:20` | freshness; `modified` useful for change detection |
| `link` | `…/coppie-cpt/<slug>/` | (login-gated — for reference only) |

**Limitation:** `acf` is returned **empty (`[]`)** and `meta` only has
`_acf_changed`. **The scores/phases/participants are NOT in the REST payload** — they
are only in the rendered `live-*` HTML. So REST is valuable as a **cheap index/crawler
seed** (enumerate every category with its `post_id`, `title`, `date`, `modified`), and
the actual data is scraped from the `live-*` pages by `post_id`.

Other REST namespaces present are stock plugins (Yoast, Elementor, Google Site Kit,
Altervista `av/v1` migrator, `frontend-admin`) — **no custom scoring endpoint**.
`admin-ajax.php` actions found in JS (`pmg_save_timetable`, `pmg_get_tramonto`,
`pmg_genera_timetable`) are **admin write actions** (nonce + login) — not data reads.

## Data Views

### 1. Home — competition cards

Container of cards; each card:

```html
<div class="gara-item"
     data-competizione="CAMPIONATI ITALIANI MG A COPPIE"
     data-url="https://pmglivescore.altervista.org/competizione/?competizione=CAMPIONATI+ITALIANI+MG+A+COPPIE">
  <div class="gara-header">
    <h3 class="gara-title"><a class="gara-edit-link" href="…?competizione=…">3ª TAPPA TROFEO FEDERALE MOUNTED GAMES</a></h3>
  </div>
  <div class="gara-footer">
    <div class="gara-footer-row">
      <div class="gara-footer-meta">
        <div class="gara-luogo">PISA</div>
        <div class="gara-date">20 Giugno 2026 - 21 Giugno 2026</div>
      </div>
      <div class="gara-logo-wrap">
        <img src="…/logo-pony-country-club-boccadarno.jpeg" alt="PISA" />
        <span class="gara-centro-nome">Pony Country Club<br />Boccadarno</span>
      </div>
    </div>
    <div class="gara-numero-gare">
      <span>8 Gare</span>
      <span class="gara-stato gara-stato--conclusa">Conclusa</span>
    </div>
  </div>
</div>
```

Field map:

| Field | Selector | Sample |
|---|---|---|
| Competition name (id) | `.gara-item[data-competizione]` / `.gara-title a` text | `CAMPIONATI ITALIANI MG A COPPIE` |
| Competition URL | `.gara-item[data-url]` | `…?competizione=…` |
| City / venue town | `.gara-luogo` | `PISA` |
| Dates | `.gara-date` | `20 Giugno 2026 - 21 Giugno 2026` |
| Venue name | `.gara-centro-nome` (newlines = `<br>`) | `Pony Country Club Boccadarno` |
| Venue logo | `.gara-logo-wrap img@src` | image URL |
| Number of games/categories | `.gara-numero-gare > span:first-child` | `8 Gare` |
| Status | `.gara-stato` (modifier class `gara-stato--conclusa`) | `Conclusa` |

#### Live list — `in_corso` cards (automatic live window)

`listLiveEvents` derives the *currently-running* competitions from the home page,
so no manual flag or date heuristic is needed. Two hops:

1. **Select in-progress cards.** On the home page, each competition card
   (`.gara-item`) carries its state in a `.gara-stato` element whose modifier
   class is `gara-stato--programmata` | `gara-stato--in_corso` |
   `gara-stato--conclusa`. The pure helper `parseInProgressCompetitions(html)`
   selects `.gara-item` cards containing `.gara-stato--in_corso` and reads each
   card's `data-competizione` (the competition **name**) and `data-url` (its
   `/competizione/?competizione=<NAME>` link). Results are de-duplicated by
   normalized name.

2. **Resolve name → category `post_id`s.** A home card is keyed by the
   competition **name**, not by `post_id`, so each in-progress competition is
   resolved to its category posts via **wp-json title match** (the chosen path —
   more reliable than parsing the `/competizione/` page, and it reuses the same
   CPT enumeration `listEvents` already relies on): fetch
   `/wp-json/wp/v2/<cpt>?per_page=100&_fields=id,title` for the three CPTs
   (`squadre-cpt`, `individuali-cpt`, `coppie-cpt`), index every post by
   `normalizeKey(title.rendered)`, then collect the ids whose normalized title
   equals the card's normalized `data-competizione`. `normalizeKey` decodes HTML
   entities (`&#8211;` → `–`), NFC-normalizes, collapses whitespace (handles the
   double-space titles like `2ª TAPPA TROFEO FEDERALE  MOUNTED GAMES`) and
   case-folds, so the card name matches `title.rendered` despite encoding drift.

Each resolved `post_id` becomes a classifica entry target
(`{ kind: "classifica", url: "<PMG_BASE>/live-classifica-generale/?post_id=<id>" }`),
identical in shape to `listEvents`; the poller discovers each category's live
sub-phases when it later parses that classifica page.

> **Capture note:** at fixture-capture time all 8 home cards were
> `gara-stato--conclusa` (no competition in progress). `listLiveEvents` returns
> `[]` cleanly in that case. The test fixture
> (`lib/scrapers/__fixtures__/pmg/home.html`) is a trimmed home with one card
> hand-adjusted to `gara-stato--in_corso` (plus one `programmata` and two
> `conclusa`) so the in_corso selection path is asserted.

### 2. Competition page — `/competizione/?competizione=<NAME>`

Header:

| Field | Selector | Sample |
|---|---|---|
| Title | `.pmg-competition-title` | `CAMPIONATI ITALIANI MG A COPPIE` |
| Location | `.pmg-competition-location` | town |
| Dates | `.pmg-competition-dates` | `21 Maggio 2026 - …` |
| Venue name | `.pmg-competition-centro-nome` | |
| Venue logo | `.pmg-competition-logo-wrap img` | |

Per-category block — repeated `.gara-item` (here a **category**, not a competition):

```html
<div class="gara-item" data-url="…/live-classifica-generale/?post_id=47264"
     onclick="window.location.href=this.dataset.url">
  <div class="gara-content">
    <div class="gara-header">
      <div class="gara-badges">
        <span class="category-badge category-openpro">OPEN PRO</span>
        <span class="modality-badge modality-coppie">A Coppie</span>
        <span class="gara-campo">Campo: DERBY</span>
      </div>
    </div>
    <div class="gara-footer">
      <div class="gara-title-divider"></div>
      <div class="pmg-stati-gara-table-wrap">
        <table class="pmg-stati-gara-table">
          <thead><tr><th class="col-fase">Fase</th><th class="col-stato">Stato</th><th class="col-segreteria">Segreteria</th></tr></thead>
          <tbody>
            <tr><td class="col-fase">Gara</td><td class="col-stato stato-conclusa">Conclusa</td><td class="col-segreteria segr-ok">Verificata</td></tr>
            <tr><td class="col-fase">Sessione 1</td>…</tr>
            <tr><td class="col-fase"><span class="pmg-label-short">Semif. Ing.</span><span class="pmg-label-long">Semifinale Inglese</span></td>…</tr>
            <tr><td class="col-fase">Finale A</td>…</tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
```

Field map (per category):

| Field | Selector | Sample / values |
|---|---|---|
| Category (age/level) | `.category-badge` text + class `category-<slug>` | `OPEN PRO` (`category-openpro`), `category-u18-pro`, `category-u18`, `category-u15-pro`, `category-u15`, `category-u12-pro`, … |
| Modality (format) | `.modality-badge` text + class `modality-<slug>` | `A Coppie` (`modality-coppie`), `A Squadre` (`modality-squadre`), `modality-individuale` |
| Field / arena | `.gara-campo` | `Campo: DERBY` (also `SABBIA`, `DANTE`, `VASARI` — venue-specific) |
| Data-view link | `.gara-item[data-url]` → extract `post_id` | `post_id=47264` |
| Phase rows | `.pmg-stati-gara-table tbody tr` | one per phase |
| Phase name | `td.col-fase` (prefer `.pmg-label-long` when present) | see Enums |
| Phase status | `td.col-stato` class `stato-<state>` | `programmata` / `in_corso` / `conclusa` |
| Secretariat check | `td.col-segreteria` (class `segr-ok`) | `Verificata` (verified) |

### 3. Live general standings — `/live-classifica-generale/?post_id=<POST_ID>`

Primary results view. Table `.pmg-classifica-generale-table` (also carries
`.pmg-classifica-table`; `.pmg-classifica-storica` when historical/concluded). The
wrapper carries the overall state, e.g. `<div class="…-wrapper stato-conclusa">`.

```html
<table class="pmg-classifica-table pmg-classifica-generale-table pmg-classifica-storica">
  <thead><tr>
    <th class="col-pos">Posizione</th>
    <th class="col-riders">Coppie</th>
    <th class="col-session col-s1">Sessione 1</th>
    <th class="col-session col-s2">Sessione 2</th>
    <th class="col-session col-s3">Sessione 3</th>
    <th class="col-tot-sessioni">Totale</th>
    <th class="col-semifinale">Semifinale</th>
    <th class="col-finale col-sort-active">Finale</th>
  </tr></thead>
  <tbody>
    <tr>
      <td class="col-pos">1</td>
      <td class="col-riders">LA FARNIA</td>
      <td class="col-session col-s1">35 <span class="batteria-label">(B1)</span></td>
      <td class="col-session col-s2">35 <span class="batteria-label">(B2)</span></td>
      <td class="col-session col-s3">28 <span class="batteria-label">(B1)</span><span class="pareggio-marker">*</span></td>
      <td class="col-tot-sessioni">98</td>
      <td class="col-semifinale">32</td>
      <td class="col-finale">36 <span class="finale-tipo-label">(A)</span></td>
    </tr>
  </tbody>
</table>
```

Field map (per row = one participant):

| Field | Selector | Sample |
|---|---|---|
| Position | `td.col-pos` | `1` |
| Participant label | `td.col-riders` | `LA FARNIA`, `ANDRE E LEO` (see Opaque Data) |
| Session score | `td.col-s1` / `col-s2` / `col-s3` — numeric text | `35` |
| Session heat | `.batteria-label` inside the session cell | `(B1)` = batteria 1 |
| Tiebreak marker | `.pareggio-marker` (`*`) | flags a tie resolution |
| Sessions total | `td.col-tot-sessioni` | `98` |
| Semifinal score | `td.col-semifinale` | `32` |
| Final score | `td.col-finale` | `36` |
| Final type | `.finale-tipo-label` inside final cell | `(A)` = Final A (also `(B)`) |

> **Columns vary per format/competition** — the team example above omits
> `col-semifinale`; individuals may differ again, and some phases may be absent when
> not yet played. **Parse the `<thead>` to build a column→field map, then read cells
> by class** (`col-pos`, `col-riders`, `col-s1..3`, `col-tot-sessioni`,
> `col-semifinale`, `col-finale`). Do **not** assume fixed column positions.
> The `col-riders` header text also changes with modality: `Coppie` / `Squadre` /
> (individuals — TODO confirm exact word).

### 4. Registered participants / binomi — `/iscritti-coppie/?post_id=<POST_ID>`

Embeds a JS global mapping each participant **label** to its riders and horses:

```html
<script>window.iscrittiGlobali = {
  "RUSGHEDDU": [
    {"cognome":"FILIGHEDDU","nome":"ANDREA MARIO","pony":"CANDY"},
    {"cognome":"RUSSO","nome":"ANDREA","pony":"ALZANA"}
  ],
  "LA FARNIA": [
    {"cognome":"LAZZERI","nome":"LORENZO","pony":"CYMBOLIEK-C"},
    {"cognome":"LAZZERI","nome":"SIMONE","pony":"GRACE BO SUN ED"}
  ],
  …
};</script>
```

Shape: `{ "<LABEL>": [ { "cognome": <surname>, "nome": <first name>, "pony": <horse name> }, … ] }`.
Extract with a regex on `window.iscrittiGlobali = ({...});` then `JSON.parse`.

- The **label is the join key** back to `col-riders` in the standings table.
- Team variant `/live-iscritti-squadre/?post_id=…`, individuals
  `/live-iscritti-individuali/?post_id=…` — **both confirmed** (see Per-Format Breakdown).
- ⚠️ **UPDATED:** `window.iscrittiGlobali` is **populated on every `live-*` phase view**
  (`live-classifica-generale`, `live-sessione*-batteria*`, `live-semifinale-inglese`,
  `live-finale-a`) **as well as** on the `live-iscritti-<format>` page — all three
  formats were verified carrying the full roster on the standings page itself, so a
  single GET of `live-classifica-generale` yields **both** scores **and** the
  label→roster map. (The earlier note that the standings map was empty did not hold on
  the current events; an empty `{}` only appears on the generic `/competizione/` page
  and before any roster has been entered.)

### 5. Time Table — on the competition page

Table `.pmg-tt-card-table`, grouped by **day** and by **field** (column group header
`CAMPO <NAME>`):

```html
<table class="pmg-tt-card-table">
  <colgroup><col class="pmg-tt-col-giorno"><col class="pmg-tt-col-orario"><col class="pmg-tt-col-gara"><col class="pmg-tt-col-fase"><col class="pmg-tt-col-batteria"></colgroup>
  <thead>
    <tr><th class="pmg-tt-th-giorno" rowspan="2">Giorno</th><th class="pmg-tt-th-campo" colspan="4">CAMPO DERBY</th></tr>
    <tr class="pmg-tt-th-sub"><th class="pmg-tt-th-sub-orario">Orario</th><th class="pmg-tt-th-sub-gara">Gara</th><th class="pmg-tt-th-sub-sessione">Fase</th><th class="pmg-tt-th-sub-batteria">Batteria</th></tr>
  </thead>
  <tbody>
    <tr class="pmg-tt-live-row">
      <td class="pmg-tt-td-giorno" rowspan="8"><span class="pmg-tt-giorno-label">Domenica 24 maggio</span></td>
      <td class="pmg-tt-td-orario pmg-tt-orario-bold">
        <span class="pmg-tt-consuntivo pmg-tt-cons-inizio-live">08:01</span>
        <span class="pmg-tt-cons-sep"> - </span>
        <span class="pmg-tt-consuntivo pmg-tt-cons-fine-live">09:10</span>
      </td>
      <td class="pmg-tt-td-gara">UNDER 12 PRO</td>
      <td class="pmg-tt-td-sessione">S…</td>
      <td class="pmg-tt-td-batteria">…</td>
    </tr>
  </tbody>
</table>
```

Field map:

| Field | Selector | Sample |
|---|---|---|
| Field/arena (group header) | `.pmg-tt-th-campo` | `CAMPO DERBY` |
| Day | `td.pmg-tt-td-giorno` / `.pmg-tt-giorno-label` (rowspan groups the day) | `Domenica 24 maggio` |
| Time (actual/consuntivo) | `.pmg-tt-cons-inizio-live` / `.pmg-tt-cons-fine-live` | `08:01` / `09:10` |
| Category (gara) | `td.pmg-tt-td-gara` | `UNDER 12 PRO` |
| Phase | `td.pmg-tt-td-sessione` | session/phase name |
| Heat | `td.pmg-tt-td-batteria` | batteria |

`pmg-tt-live-row` marks the currently-live row; `pmg-tt-consuntivo` = actual times (vs
planned). TODO: capture a scheduled (not-yet-run) timetable to document the planned-time
markup.

### 6. Event info — `/live-info-gara/?post_id=<POST_ID>`

**Format-agnostic** (same layout for coppie / squadre / individuali). A label→value
metadata panel describing the category and its phase configuration — useful to learn a
category's expected phase set *before* parsing standings (how many sessions/heats, which
semifinal type, how many final lanes, per-phase state). Confirmed fields (label → value):

| Field | Sample | Notes |
|---|---|---|
| `Luogo` | `TORTONA` | venue town |
| `Inizio` / `Fine` | `21/05/2026` / `24/05/2026` | **`DD/MM/YYYY`** here (differs from the card format) |
| `Campo gara` | `DERBY` | arena |
| `Sessioni` | `3` | number of qualifying sessions |
| `Batterie` | `5` | number of heats (explains the `batteria5` slug — it is the heat count) |
| `Semifinale` | `Inglese` | semifinal type (empty/absent when the category has no semifinal) |
| `Corsie Finale` | `5` | number of final lanes |
| `Finale` | `A` | final type present |
| `Stato Gara` | `Conclusa` | overall state (`Programmata`/`In corso`/`Conclusa`) |
| `Segreteria` | `VERIFICATA` | secretariat verification (uppercase here) |
| `Stato Sessione 1..N` + `Segreteria` | `Conclusa` / `VERIFICATA` | per-session state + verification, repeated per session |

The nav bar on any `live-*` page (Elementor menu, class `aux-menu-label`) enumerates the
phase views available for that category: **Info Gara → Iscritti → Giochi → Sessione 1..N
→ Semifinale → Finale → Classifica Generale**. Scrape those anchors (they carry the
`post_id`) rather than hardcoding the phase set — presence of the Semifinale/Finale items
varies by category.

## Per-Format Breakdown (SQUADRE / INDIVIDUALI / COPPIE)

All three formats share the **same plumbing** (CPT → `post_id` → `live-*` views;
`window.iscrittiGlobali` label→roster map; `col-riders` label join). They differ in: the
CPT type, the `col-riders` header word, the roster **arity** (how many riders per label),
and what the label string represents. The standings table structure is identical — always
parse `<thead>` to build a `col-*`→field map (see Data Views §3); columns present
(`col-semifinale`, `col-finale`) depend on the category's phase config, **not** the
format.

**Roster shape is uniform across formats:**
`window.iscrittiGlobali = { "<LABEL>": [ {"cognome","nome","pony"}, … ] }`.
Every format uses the *same* per-rider object `{cognome, nome, pony}` — **horses/ponies
are present for all three formats** (the `pony` field), and each rider is identified by
surname + first name only (no id). The only variable is the **length** of the array per
label. The map is served identically on the `live-iscritti-<format>` page **and** on
every `live-*` standings/phase page for that `post_id`.

⚠️ **Join-key caveats (all formats):** the standings `col-riders` cell is
**HTML-entity-encoded** (e.g. `ANDRE &amp; LEO`) while the `iscrittiGlobali` key is the
decoded string (`ANDRE & LEO`) — decode before matching. Labels are **free text chosen
per event**, so the *same* pair may appear as `ANDRE E LEO` in one event and
`ANDRE & LEO` in another — **only join within the same `post_id`**, never across events.

### SQUADRE (teams) — `squadre-cpt`

- **Enumerate:** `/wp-json/wp/v2/squadre-cpt?per_page=100&page=<n>` → `id` (=`post_id`),
  `slug`, `title.rendered` (competition name, shared by its categories), `date`,
  `modified`. `acf` empty, `meta` only `_acf_changed` (no scores in REST) — index seed
  only. ~21 category posts at discovery time.
- **Live views:** `live-classifica-generale`, `live-sessione<S>-batteria<B>`,
  `live-semifinale-inglese` (when configured), `live-finale-a`, `live-iscritti-squadre`,
  `live-info-gara`. Verified event: **`post_id=45941`** (PONY MASTER SHOW — CAMPIONATI
  ITALIANI MG A SQUADRE MASCHERONI).
- **Standings `<thead>`:** `col-pos` | `col-riders` **header text = `Squadre`** |
  `col-s1` `col-s2` `col-s3` | `col-tot-sessioni` | `col-finale` (this event had **no**
  `col-semifinale`; presence is per-category).
- **Row / label:** `col-riders` = **team nickname** (e.g. `LA FARNIA`, `SCUDY WE HOPE`,
  `CINGHIALS`). Session cells: score + `.batteria-label` `(B1)` + optional
  `.pareggio-marker` `*`; totals in `col-tot-sessioni`; final in `col-finale` with
  `.finale-tipo-label` `(A)`. **Scores may be decimal** (e.g. `48.5`).
- **`iscrittiGlobali`:** label → **array of ~5 riders** (a full team), e.g.
  `"SCUDY WE HOPE": [{cognome:"LEONCAVALLO",nome:"EDOARDO",pony:"MARLENE MONISCIONE"}, …×5]`.
  13 teams in the verified event. Multiple riders per label are simply the array
  elements — order is roster order, no per-rider role/slot marker.
- **Horses/riders:** ✅ full roster with ponies exposed. **This is the key win vs
  mg-scoreboard.de**, whose team events are nation-opaque — here every team member +
  pony is listed.
- **Gaps:** no per-rider club/role, no stable ids; team nickname is not a normalized
  entity (varies per event).

### INDIVIDUALI (individual) — `individuali-cpt`

- **Enumerate:** `/wp-json/wp/v2/individuali-cpt` → same field set. **Sparse: only 3
  posts** at discovery, and their `title.rendered` are **borrowed from parent
  competitions** (`CAMPIONATI ITALIANI MG A COPPIE`, `PONY MASTER SHOW … A SQUADRE`,
  `2ª TAPPA TROFEO FEDERALE MOUNTED GAMES`). → The individual format is a **derived
  individual ranking attached to a coppie/squadre competition**, not a standalone event
  series. Treat it as an optional extra classification, not a primary event type.
- **Live views:** `live-classifica-generale`, `live-iscritti-individuali`,
  `live-info-gara`, session heats. Verified event: **`post_id=47265`** (individual
  ranking of CAMPIONATI ITALIANI MG A COPPIE).
- **Standings `<thead>`:** `col-pos` | `col-riders` **header text = `Individuali`** |
  `col-s1` `col-s2` `col-s3` | `col-tot-sessioni`. **No semifinale/finale columns** in
  the verified event (individual ranking is session-total based).
- **Row / label:** `col-riders` = a **single rider identifier — the surname**
  (e.g. `GHEZZI`, `LERMA`). Session cells carry decimal scores + `.batteria-label`
  (e.g. `40.1 (B1)`), summed in `col-tot-sessioni` (`124.2`).
- **`iscrittiGlobali`:** label → **array of exactly ONE rider**, e.g.
  `"GHEZZI": [{cognome:"GHEZZI",nome:"BEATRICE",pony:"DONJA V.H.WOLFERSVEEN"}]`. The
  label equals that rider's `cognome`.
- **Horses/riders:** ✅ rider + pony exposed (arity 1).
- **Gaps:** the surname-only label **can collide** if two competitors share a surname
  within one event — the label alone is not guaranteed unique; use the resolved
  `{cognome, nome}` from `iscrittiGlobali` for identity. Very few published individual
  events, so live coverage of this format is rare.

### COPPIE (pairs) — `coppie-cpt`

- **Enumerate:** `/wp-json/wp/v2/coppie-cpt?per_page=100&page=<n>` → same field set.
  **Most populous** CPT (40+ category posts across many competitions — trofeo federale,
  4 regioni, gold riders arena, campionati a coppie, …).
- **Live views:** `live-classifica-generale`, `live-sessione<S>-batteria<B>`,
  `live-sessione1-giochi`, `live-semifinale-inglese`, `live-finale-a`,
  `live-iscritti-coppie`, `live-info-gara`. Verified events: **`post_id=47264`**
  (completed — full semifinal+final columns) and **`post_id=48397`** (future/not-run —
  all score cells `-`).
- **Standings `<thead>`:** `col-pos` | `col-riders` **header text = `Coppie`** |
  `col-s1` `col-s2` `col-s3` | `col-tot-sessioni` | **`col-semifinale`** |
  **`col-finale`** (completed 47264). A not-yet-run category (48397) shows only
  `col-s1..3`+`col-tot-sessioni` with every cell `-`; columns fill in as phases are
  configured/played.
- **Row / label:** `col-riders` = **pair nickname** — free text joining the two riders,
  e.g. `ANDRE E LEO`, `CLAUDIA E TOMMI`, `LA FARNIA`, or with ampersand `LAVI & LETI`
  (`&amp;` in HTML). Semifinal cell plain numeric (`32`); final cell numeric +
  `.finale-tipo-label` `(A)`.
- **`iscrittiGlobali`:** label → **array of exactly 2 riders**, e.g.
  `"ANDRE & LEO": [{cognome:"FARINETTI",nome:"ANDREA",pony:"RV IRON FLING"},
  {cognome:"BUGGIANI",nome:"LEONE",pony:"SPERANZA"}]`. Both pair members + their ponies
  listed; array order is roster order.
- **Horses/riders:** ✅ both riders + both ponies exposed (arity 2).
- **Gaps:** nickname not normalized (per-event free text, ampersand/`E` variants); no
  ids; a category may be published before scores exist (`-` cells) — detect via
  `live-info-gara` `Stato Gara` = `Programmata`/`In corso`.

**Cross-format summary**

| | SQUADRE | INDIVIDUALI | COPPIE |
|---|---|---|---|
| CPT | `squadre-cpt` | `individuali-cpt` | `coppie-cpt` |
| `col-riders` header | `Squadre` | `Individuali` | `Coppie` |
| Label = | team nickname | rider **surname** | pair nickname |
| Roster arity/label | ~5 riders | 1 rider | 2 riders |
| Ponies exposed | ✅ | ✅ | ✅ |
| Semifinale/Finale cols | per-category | typically none | per-category |
| Volume | ~21 posts | 3 posts (derived) | 40+ posts |



- **Competition** — identified by its **name** in the `?competizione=` query param
  (URL-encoded, uppercase). The same name appears as `title.rendered` on every CPT
  category belonging to it.
- **Category (per-competition)** — a WordPress CPT post; identified by its numeric
  **`post_id`** (= REST `id`) and by its **`slug`** (kebab-case competition name +
  numeric suffix, e.g. `-8`). `post_id` is the key for all `live-*` and `iscritti-*`
  views. CPT type encodes the modality: `coppie-cpt` (pairs) / `squadre-cpt` (teams) /
  `individuali-cpt` (individuals).
- **Participant** — appears only as an **opaque label** in `col-riders`
  (e.g. `LA FARNIA`, `ANDRE E LEO`, `NICO E NIKI`). It is a team/pair nickname, not a
  normalized entity.
- **Athlete + Horse (binomio)** — resolved from `window.iscrittiGlobali` on the
  `iscritti-*` page as `{cognome, nome, pony}`. **No stable per-athlete or per-horse
  id** is exposed — only surname / first name / horse name strings. Cross-competition
  identity must be inferred by name matching (accent/case normalization) on our side.
- **Venue / club** — venue name + logo image only (`gara-centro-nome`); no id.
- **Nation** — not surfaced here (this is the Italian national circuit; nation is
  implicitly Italy). International-team opacity is an **mg-scoreboard.de** concern, not
  this source.

## Date/Number Formats & Enums

- **Dates (cards/header):** `D Mese YYYY` with Italian **capitalized** month, e.g.
  `20 Giugno 2026`, `21 Maggio 2026`. Ranges: `<start> - <end>`.
- **Dates (timetable):** `Weekday D month` with **lowercase** month and Italian
  weekday, e.g. `Domenica 24 maggio` (no year).
- **Times:** `HH:MM` 24h, range `HH:MM - HH:MM`.
- **Italian months to map:** Gennaio, Febbraio, Marzo, Aprile, Maggio, Giugno, Luglio,
  Agosto, Settembre, Ottobre, Novembre, Dicembre (accept both cases).
- **Scores:** numeric, **may be decimal** — integers (`35`, `98`, `151`) and one-decimal
  values (`48.5`, `40.1`, `124.2`) both occur (individuali scores are routinely decimal).
  Parse as float. `*` (`.pareggio-marker`) = tie/tiebreak; `-` = not-yet-scored cell.
- **Phase names (`Fase`):** `Gara`, `Sessione 1` / `Sessione 2` / `Sessione 3`,
  `Semif. Ing.` / `Semifinale Inglese` (short/long variants in the DOM),
  `Finale A` (expect `Finale B`). TODO: capture the full vocabulary across formats
  (e.g. other semifinal types besides "Inglese").
- **Phase status (`stato-*` class):** `programmata` (scheduled), `in_corso`
  (in progress / live), `conclusa` (concluded). Card-level status text: `Conclusa`
  (and presumably `In corso` / `Programmata`).
- **Secretariat (`Segreteria`):** `Verificata` (verified, class `segr-ok`). TODO:
  capture the non-verified value.
- **Category badges (`category-<slug>`):** `OPEN PRO` (`category-openpro`),
  `U18 PRO`/`U18` (`category-u18-pro`/`category-u18`), `U15 PRO`/`U15`, `U12 PRO`/`U12`,
  plus **FUTURE CLASS** (per project context — TODO confirm exact label/slug). Pattern:
  age band `U18/U15/U12` × optional `PRO`, plus `OPEN`.
- **Modality (`modality-<slug>`):** `A Coppie` (`modality-coppie`), `A Squadre`
  (`modality-squadre`), individual (`modality-individuale`).
- **Field / arena (`Campo:`):** free-text arena names, venue-specific — observed
  `DERBY`, `SABBIA`, `DANTE`, `VASARI`.
- **Heat (`batteria`):** `(B1)`, `(B2)`, … (`.batteria-label`).
- **Final type:** `(A)` / `(B)` (`.finale-tipo-label`).

### Encoding quirks (competition name in `?competizione=`)

The name is form-URL-encoded (spaces as `+`) **over already-HTML-entity-encoded text**:

| Char | In URL | Note |
|---|---|---|
| space | `+` | |
| `ª` (ordinal) | `%C2%AA` | UTF-8 of `ª` |
| `–` (en dash) | `%26%238211%3B` | = URL-encoded `&#8211;` — the dash is stored as an HTML entity **then** URL-encoded |

Examples:
- `3ª TAPPA TROFEO FEDERALE MOUNTED GAMES` → `3%C2%AA+TAPPA+TROFEO+FEDERALE+MOUNTED+GAMES`
- `PONY MASTER SHOW – CAMPIONATI ITALIANI MG A SQUADRE MASCHERONI` →
  `PONY+MASTER+SHOW+%26%238211%3B+CAMPIONATI+ITALIANI+MG+A+SQUADRE+MASCHERONI`

Also seen: **double spaces** inside names (`FEDERALE++MOUNTED`) — preserve them when
building the key. **Recommendation:** treat the `post_id` (stable integer) as the
canonical key for a category and only use the name for display / competition grouping;
avoid reconstructing the `?competizione=` string yourself — instead follow the
`data-url` / anchor hrefs already present in the HTML.

## Opaque Data / Gaps

- **Standings show only a nickname** (`col-riders`, e.g. `LA FARNIA`). Unlike
  mg-scoreboard's "Italy"-only teams, **this source DOES expose the roster**: the
  `iscritti-*` page's `window.iscrittiGlobali` maps each label to its riders + horses
  (`cognome`, `nome`, `pony`). → For pmglivescore, the crowdsourcing layer is mostly
  **not** needed to reveal who competed; it's needed only to (a) normalize
  athlete/horse identity across competitions (no ids, only name strings) and (b) fill
  the gaps below.
- **No stable ids** for athlete / horse / team / venue — only display strings. Identity
  resolution across events is on us (accent/case-insensitive name matching).
- **Missing structured metadata:** no club/affiliation per rider, no horse breed/age,
  no birth year / category eligibility data — only names.
- **CPT permalinks are login-gated** (`/coppie-cpt/<slug>/` → `wp-login.php`); the
  public data lives entirely in the `live-*` / `iscritti-*` query-param pages.
- **XML import format not obtained** — see below.

## XML Import Format

**NOT captured.** `/importa-xml/` is a **login-gated frontend-admin form**
("Accesso negato" for anonymous; no `<input type="file">` rendered without auth). No
sample import XML is linked publicly, and none is referenced in the front-end JS. The
`av/v1/import` REST route belongs to Altervista's generic site migrator, not the MG
import. The `admin-ajax` actions (`pmg_genera_timetable`, `pmg_save_timetable`,
`pmg_get_tramonto`) are timetable-generation writes, not the score importer.

> **TODO: needs a real XML sample** (likely the on-field scoring software export). We
> have **no anonymous access** to it. Options: ask the site operator, or treat the
> rendered `live-*` HTML as the source of truth (fully sufficient for our ingestion —
> the HTML already carries scores, phases, heats, and rosters). **Recommendation:**
> build the pmglivescore scraper against the HTML views; revisit XML only if a sample
> becomes available.

Inferred logical hierarchy (from the rendered views, pending XML confirmation):

```
Competition (name)
└── Category (post_id; modality = coppie|squadre|individuali; age band; field/campo)
    ├── Phases: Gara, Sessione 1..3, Semifinale (Inglese/…), Finale A/B
    │   └── each phase → participant scores, per-session heat (batteria B1/B2…)
    ├── Standings (classifica generale): pos, label, S1..S3, total, semifinal, final
    └── Roster (iscritti): label → [ {cognome, nome, pony} ]
```

## Open Questions / TODO

- **RESOLVED:** individuals slug is `live-iscritti-individuali` (+ `/iscritti-individuali/`
  alias); individuals standings columns = `col-pos` `col-riders`(header `Individuali`)
  `col-s1..3` `col-tot-sessioni` (no semi/final in the verified event). See Per-Format
  Breakdown.
- **RESOLVED:** heat slug shape is `live-sessione<S>-batteria<B>` (not `live-batteria<N>`);
  `batteria5` is the heat count from `live-info-gara` `Batterie`. Also `live-sessione1-giochi`.
- **RESOLVED:** `window.iscrittiGlobali` is populated on the `live-*` standings/phase
  pages too, not only on `iscritti-*` — one GET yields scores + roster.
- **TODO:** obtain a real import XML sample and document its element/attribute schema.
- **TODO:** capture a **live / scheduled** competition (states `in_corso` /
  `programmata`) to confirm live-cell markup and the planned-vs-actual timetable times
  (`pmg-tt-consuntivo` vs a planned-time class). Partially covered: coppie `48397` shows
  the `-` (not-yet-scored) standings state.
- **TODO:** enumerate the full phase vocabulary (semifinal types besides `Inglese`?
  confirm `live-finale-b`) and the full category-badge set (confirm **FUTURE CLASS**
  slug/label).
- **TODO:** confirm the non-verified `Segreteria` value(s) (verified appears as
  `Verificata` in the phase table and `VERIFICATA` in `live-info-gara`).
- **TODO:** decide the poll cadence for live windows and confirm pages stay
  `UNCACHEABLE` under load.

---

*Discovery method: read-only `curl` GETs (descriptive UA, ≥2 s delays). Enumerated all
three CPTs via `wp-json`, then fetched `live-classifica-generale`, `live-iscritti-*` and
`live-info-gara` for one real event per format — squadre `45941`, individuali `47265`,
coppie `47264` (completed) and `48397` (not-yet-run) — plus the phase-nav anchors on a
completed coppie page. Playwright not required — all data (scores, phases, heats, and the
`window.iscrittiGlobali` roster) is in static server-rendered HTML, present on the
standings page itself.*

---

## Re-verification 2026-09-30

Re-verified against the live site ahead of the spec-04 parser rewrite (Phase B).
**Method:** plain HTTP GET (no JS, no Playwright) — production's `fetch` + `cheerio`
path. Focus is the spec-04 fields (dates + level vocabulary + category badges).
Prior baseline: discovery per the sections above.

**Reachability note:** the home page returned **HTTP 503** on the first attempt
(Altervista shared hosting / Varnish — transient). A single polite retry after ~60 s
succeeded. The dev's scraper should treat 503 as retryable with backoff; it is not a
structural change.

Pages checked (both loaded fully as static server-rendered HTML):
- Home: `https://pmglivescore.altervista.org/`
- Competition page: `/competizione/?competizione=CAMPIONATI+ITALIANI+MG+A+COPPIE`

### 3. pmg DATES — **CONFIRMED**

- **Home cards** expose the date inline as `.gara-date` in **`D Mese YYYY`** with a
  **capitalized** Italian month, range joined by ` - `. Verbatim this run:
  `18 Settembre 2026 - 20 Settembre 2026`, `5 Settembre 2026 - 6 Settembre 2026`,
  `20 Giugno 2026 - 21 Giugno 2026`, `21 Maggio 2026 - 24 Maggio 2026`,
  `30 Aprile 2026 - 3 Maggio 2026`, `27 Febbraio 2026 - 1 Marzo 2026`,
  `30 Gennaio 2026 - 1 Febbraio 2026`. **CONFIRMED unchanged.**
- **Competition page header** exposes the date inline too, as
  `TORTONA • 21 Maggio 2026 - 24 Maggio 2026` (`.pmg-competition-dates`), same
  `D Mese YYYY` capitalized-month format. **CONFIRMED.**
- The spec-04 design's pmg path ("`buildCompetition` parse `live-info-gara` `Inizio`/`Fine`
  or `.gara-date` as `DD/MM/YYYY`") — the **`DD/MM/YYYY`** numeric format is the one on
  `live-info-gara` (per the baseline section above; not re-fetched this run since it was
  unchanged at discovery and is format-agnostic). The **card/header** dates are the
  capitalized-Italian-month `D Mese YYYY` form, so the Italian-month map IS needed if the
  parser reads `.gara-date`/`.pmg-competition-dates` rather than `live-info-gara`.
  **Both formats coexist and both are unchanged** — pick the source deliberately and map
  Italian months for the card/header form. Italian months to map (capitalized on
  cards/header, lowercase on timetable): `Gennaio, Febbraio, Marzo, Aprile, Maggio,
  Giugno, Luglio, Agosto, Settembre, Ottobre, Novembre, Dicembre`.

### 4. LEVEL inference / category vocabulary — **CONFIRMED + FUTURE CLASS resolved**

- **Category badges** on the competition page (verbatim this run, CAMPIONATI ITALIANI MG
  A COPPIE): `OPEN PRO`, `OPEN`, `UNDER 18 PRO`, `UNDER 18`, `UNDER 15 PRO`, `UNDER 15`,
  `UNDER 12 PRO`, and **`FUTURE CLASS`**. This **RESOLVES** the prior TODO — `FUTURE CLASS`
  is a real, current category badge (rendered as a category-badge; note its modality on
  this event was `Individuali`, the others `A Coppie`). Pattern holds: age band
  `UNDER 18/15/12` × optional `PRO`, plus `OPEN`, plus the standalone `FUTURE CLASS`.
- **Modality badges**: `A Coppie` and `Individuali` seen on this event (`A Squadre`
  per baseline). Unchanged.
- **Level**: pmg is the single-level Italian national circuit. Titles this run:
  `CAMPIONATI ITALIANI MG A COPPIE`, `CAMPIONATI ITALIANI MG A SQUADRE MASCHERONI`
  (→ **national** via the `CAMPIONATI ITALIANI` marker); the `TROFEO FEDERALE`,
  `TROFEO 4 REGIONI`, `GOLD RIDERS ARENA`, `PONY MASTER SHOW` series → **null/regional**
  (no championship marker), consistent with the spec's "map obvious CAMPIONATI ITALIANI →
  national, else null" rule.

### Also re-confirmed (context for the dev, not spec-04-specific)

- **Phase table** `Fase | Stato | Segreteria` per category: `Gara`, `Sessione 1..3`,
  `Semif. Ing.`/`Semifinale Inglese` (short+long DOM variants BOTH render — prefer
  `.pmg-label-long`), `Finale A`; status `Conclusa`, secretariat `Verificata`. **Unchanged.**
- **Timetable** grouped by `CAMPO <NAME>` (`DERBY`, `SABBIA`) and by day with a
  **lowercase** Italian month (`Domenica 24 maggio`, `Sabato 23 maggio`, `Venerdì 22
  maggio`, `Giovedì 21 maggio`), consuntivo times `HH:MM - HH:MM`, `Batteria 1..5`,
  plus `Pausa Tecnica` / `Ripresa: HH:MM` rows. **Unchanged.**
- **`?competizione=` encoding** unchanged: `%C2%AA` for `ª`, `%26%238211%3B` for the
  en-dash (seen on `PONY MASTER SHOW – …`), and preserved double-space in
  `2ª TAPPA TROFEO FEDERALE  MOUNTED GAMES`. Recommendation stands: follow the `data-url`
  / anchor hrefs rather than reconstructing the query string.
- **Live window:** at capture time ALL home cards were `Conclusa` (newest:
  `3ª/4ª TAPPA TROFEO 4 REGIONI` and `4ª TAPPA TROFEO FEDERALE`, Sept 2026), so
  `listLiveEvents` returns `[]` cleanly — no `in_corso`/`programmata` card to observe live
  markup this run (still an open TODO, as at baseline).

### Verdict — pmglivescore.altervista.org: **parsers SAFE to rewrite as-designed**

All spec-04 fields (inline dates in both `D Mese YYYY` card/header form and `DD/MM/YYYY`
`live-info-gara` form; category badges incl. the now-confirmed `FUTURE CLASS`; single-level
mapping) are **unchanged**. Only operational caveat: handle transient **503s** with a
retry/backoff (hit once this run). No JS-only content; `fetch` + `cheerio` remains
sufficient.

Suggested commit:
`docs(sources): :memo: re-verify pmglivescore spec-04 fields (2026-09-30) — dates/badges confirmed, FUTURE CLASS resolved, note 503 retry`
