# mg-scoreboard.de — Scraping Contract

> Discovery date: 2026-08-09. Reference events: **id=4795** "IMGA European Team
> Championships 2026 - Under 12a" (Team format), **id=4629** "IMGA European
> Individual Championships 2026 - Under 12" (Individual format — added on 2026-08-09
> to document how named riders appear) and **id=4856** "CLUB ELITE PAIRES CORNE AOUT
> 2026" (Pairs format — added on 2026-08-10 to document the pair label shape).
> Playwright MCP was **not** used; findings are from `curl` (GET only) + static
> HTML/JS inspection. Live network capture is marked `TODO:` where it would add
> certainty.
>
> **Key format split (read first):** a "participant" on this site is polymorphic by
> event format. In **Team** events it is a **nation + age category** (`England U12`,
> opaque — no riders). In **Individual** events it is a **named rider** (`Chloe
> LORENZON`) that carries its own `team_id` and a per-event start number. In **Pairs**
> events it is a **pair label** (`EILEEN ET MEHDI`, `Laura et Axel`, or a club name
> like `TPM DUVERGEAX`) that carries its own `team_id` **and a nation flag**, but the
> two riders are **never individually structured** — only concatenated (or replaced by
> a club name) in one free-text label. So mg is opaque about *who rode* for both Team
> and Pairs events; only Individual events publish clean per-rider identities.
> Horses/ponies appear in **none** of the three formats.

## Overview

- **Tech:** PHP on `Apache/2.4.67 (Debian)`. Fully **server-rendered HTML**; jQuery
  1.12.4 + Bootstrap 3 front-end. PWA (`/manifest.json`, `pwa/main.js`).
- **Rendering model:** every data view is present in the initial HTML response — no
  client-side rendering of scores. **`fetch` + `cheerio` is sufficient**; no browser
  needed in production.
- **Cookies:** sets `PHPSESSID` and a `language` cookie (`language=en`, 30-day). The
  site defaults to **English** when `language=en` is sent; without it labels may be
  German. **Send `Cookie: language=en`** on every request to pin English UI strings.
- **Caching:** responses are `Cache-Control: no-store, no-cache` — always fresh, safe
  to poll, but no ETag/Last-Modified to short-circuit polls.
- **robots.txt:** minimal — only `Allow: /ads.txt` and a `Sitemap:` line, no
  `Disallow`. Scraping the public event pages is not disallowed. Still be polite.
- **Politeness:** the on-page Refresh button self-throttles to **once per 5 s**. Match
  that: poll a live event no faster than every ~10-15 s (per functional spec), add a
  small delay between sub-view fetches, set a descriptive User-Agent.

## URL Patterns

Base: `https://www.mg-scoreboard.de/`. Both `?seite=...` and `index.php?seite=...`
work (archive links use the `index.php` form).

| Purpose | URL template | Notes |
|---|---|---|
| Event (default view = Toplist) | `?seite=show_event&id=<eventId>` | `eventId` int |
| Toplist / standings | `?seite=show_event&id=<eventId>&seite2=event_points_list_show` | per-session totals |
| Teams (participant list) | `?seite=show_event&id=<eventId>&seite2=event_teams_show` | **only place with team_id links** |
| Game list | `?seite=show_event&id=<eventId>&seite2=event_gamelist_show` | games played in event |
| Timetable | `?seite=show_event&id=<eventId>&seite2=event_timetable` | schedule |
| The Draw | `?seite=show_event&id=<eventId>&seite2=event_draw` | start order |
| Event info | `?seite=show_event&id=<eventId>&seite2=event_info` | mostly modals; metadata sparse (`TODO:`) |
| Weather | `?seite=show_event&id=<eventId>&seite2=weather` | not needed |
| Livestream | `?seite=show_event&id=<eventId>&seite2=event_livestream` | external embed |
| Event shop | `?seite=show_event&id=<eventId>&seite2=event_shop` | ignore |
| Session detail (per-game scores) | `?seite=show_event&id=<eventId>&session=<n>` | n = 1..N |
| Semifinal detail | `?seite=show_event&id=<eventId>&final=semifinal` | Individual events; `final` is the literal `semifinal`, **no** `heat`. **Not seen in Pairs** (id=4856 has no semifinal) |
| Final detail (per-game scores) | `?seite=show_event&id=<eventId>&final=<tier>&heat=<h>` | `tier` = `A\|B` (Team), `A\|B\|C\|D\|E\|F` (Individual, tiered finals) or `A\|B\|C` (Pairs, id=4856); `h` = 1.. |
| Start numbers | `?seite=show_event&id=<eventId>&seite2=rolled_numbers` | "Start numbers" tab (draw/start-order variant) |
| Team profile | `?seite=team_profile&team_id=<teamId>` | nation-level; **no athletes** |
| Archive | `index.php?seite=archiv` | all past events, grouped by month |
| Upcoming | `index.php?seite=upcoming` | future events |
| German ranking (chooser) | `?seite=ger_ranking_list` | buttons pick mode/year |
| German ranking (resolved) | `?seite=ger_ranking_list&mode_id=<m>&y=<year>` | actual table |
| Swiss ranking | `?seite=che_ranking_list[&mode_id=<m>&y=<year>]` | same shape as GER |

The available `session`/`final&heat` combinations for an event are enumerated by the
tab bar `<ul class="nav nav-tabs nav-justified">` on the event page (see Data Views →
Event nav). For id=4795 (Team): `session=1..4`, `final=A&heat=1`, `final=A&heat=2`.
For id=4629 (Individual): `session=1..3`, `final=semifinal`, and one heat each of
`final=F|E|D|C|B|A` (tiered finals, worst-to-best). For id=4856 (Pairs): `session=1..3`
and one heat each of `final=C|B|A` (three tiered finals, **no** semifinal). **Never
hard-code the phase set — read it from the tab bar per event.**

## Live / Refresh Path

**There is NO JSON/AJAX endpoint that serves live scores.** The "Refresh" control is a
full page reload:

```html
<!-- Toplist page -->
<button id="refresh_button" ... onclick='reload()'>...Refresh</button>
<script> function reload(){ ... location.reload(true); } </script>
```

The button is disabled for 5 s with a countdown, then re-enabled. So the **live
source = re-fetch the same HTML page and re-parse** (poll the Toplist and/or the
active session page).

**AJAX that DOES exist (not useful for scores):**
- `ajax.php?ajax=timetable/event_timetable_ajax_action_listener&action=...` — timetable
  **editing** actions (`add`, `edit_timetable`, `get_new_data`, `get_assignment_overview`,
  `search_foreign_timetables`, ...). These are authenticated organizer actions, not a
  public read feed. `get_new_data` refreshes the timetable editor only.
- `ajax.php?ajax=notifications_ajax_action_listener` (`ajax/js/notifications.js`,
  `anonymous_notifications.js`) — the **"bell" / live-updates push**. It registers the
  browser for **Web Push** ("new points or session starts") tied to *subscribed* teams
  and events; it is a push-permission/subscription channel, **not** a pollable score
  API. There is an embedded `js-subscription-json` block for push subscription state.

**Conclusion: HTML-only. Poll the page.** `TODO:` confirm with a Playwright
`browser_network_requests` capture during a *live* event that no additional XHR fires
on Refresh (static evidence strongly indicates it does not).

### Live list — Current competitions (index nav)

The index page (`index.php`) exposes which events are **running right now** in its
top navbar, as a dedicated dropdown distinct from "Up coming competitions" and
"Archive". This is the automatic live-window source (`listLiveEvents` → Toplist entry
targets); no dates or manual flag needed.

```html
<li class="dropdown alert-info visible-sm visible-md visible-lg ">
  <a href="javascript:void(0);" class="dropdown-toggle" data-toggle="dropdown" ...>
    <span class="glyphicon glyphicon-play-circle"></span> Current competitions
    <span class="caret"></span></a>
  <ul class="dropdown-menu">
    <li class=""><a href="?seite=show_event&id=4863"><img ...> World Team Championships 2026 - U18</a></li>
    <li class=""><a href="?seite=show_event&id=4862"><img ...> World Team Championships 2026 - Open</a></li>
  </ul>
</li>
```

**Selector used (`parseCurrentEventIds`):** iterate `li.dropdown`, keep the one whose
direct `> a.dropdown-toggle` text matches `/current competitions/i`, then read event
ids from that li's `> ul.dropdown-menu a[href*="seite=show_event"]` (`?...&id=<n>`).
Text-matching the toggle is more robust than keying off the `alert-info` /
`glyphicon-play-circle` styling hooks that also mark the group.

Scoping to that dropdown-menu deliberately excludes three other id sources on the same
page: the **"Up coming competitions"** and **"Archive"** dropdowns (plain `li.dropdown`,
each with `dropdown-header` + a "See all …" footer link), and the **mobile
`li.visible-xs`** copies of the current events rendered *outside* any dropdown-menu
(same ids, but a page-wide `show_event` scan would also pull upcoming/archive). When no
event is live the "Current competitions" `ul.dropdown-menu` is empty → empty list.

**Surprise vs prior docs:** none material. The docs already noted the nav dropdowns
emit `show_event` links page-wide (the archive-parsing caveat); this confirms the live
group is a separate `li.dropdown.alert-info` with a `glyphicon-play-circle` toggle, and
that current events are additionally mirrored as `visible-xs` items outside the menu —
hence the tight `li → toggle text → ul.dropdown-menu` scoping.

## Data Views

Nation/team is always rendered as **flag `<img>` + text label** where the label is
`"<Nation> <Category>"` (e.g. `England U12`, `Italy U12`). Score-table rows do **not**
carry `team_id` (see Entities & IDs).

### Event nav (tab bar) — on every event view

```html
<ul class="nav nav-tabs nav-justified">
  <li><a href="?seite=show_event&id=4795&session=1">Session 1</a></li>
  ... session 2..4 ...
  <li><a href="?seite=show_event&id=4795&final=A&heat=1">Final A Heat 1</a></li>
  <li><a href="?seite=show_event&id=4795&final=A&heat=2">Final A Heat 2</a></li>
  <li><a href="...&seite2=event_draw">The Draw</a></li>
  <li class="active"><a href="...&seite2=event_points_list_show">Toplist</a></li>
  <li><a href="...&seite2=event_gamelist_show">Game List</a></li>
  <li><a href="...&seite2=event_teams_show">Teams</a></li>
  ... Timetable / Information / Weather / Livestream ...
</ul>
```
Parse `session=<n>` and `final=<X>&heat=<h>` hrefs to discover the phase structure.

### Toplist / standings (`seite2=event_points_list_show`)

The page has **4 `<table>`** (no class): tbl0 = totals per session, tbl1 = totals per
heat, tbl2 = totals-with-average (Ø), tbl3 = per-heat-with-average. **All cells are
`<th>`** (not `<td>`). Use tbl0 (or tbl2 for averages).

```html
<tr><th>#</th><th>Team</th><th>Points Session 1</th><th>Points Session 2</th>
    <th>Points Session 3</th><th>Points Session 4</th><th>Points overall</th></tr>
<tr><th>1</th> <th><img src="img\country_flags\_england.png" height="20px"> England U12</th>
    <th>62</th><th>69</th><th>69</th><th>57</th><th>257</th></tr>
<tr><th>2</th> <th><img src="img\country_flags\IT.png" ...>  Italy U12</th>
    <th>66</th><th>45</th><th>63</th><th>70</th><th>244</th></tr>
```

Field map (tbl0):
| Field | Source |
|---|---|
| rank | col 0 text (int) |
| team label | col 1 text (strip flag img); split into `nation` + `category` |
| nation flag code | `img` filename in col 1 (see Formats) |
| points per session | cols 2..(2+S-1), where header text is `Points Session <n>` |
| points overall | last col (`Points overall`) |

The **average table (tbl2)** inserts a `Ø` column (HTML entity `&Oslash;`) after Team.
Column **count/labels vary by event** (`Points Session n` vs `Points Heat n`) — key
columns off the header `<th>` text, do not hard-code indices.

**Individual events (id=4629):** identical table shape, but the `Team` column holds a
**rider full name** (`Chloe LORENZON`, `CJ O’Brien`) instead of `<nation> <category>`.
**CORRECTION (verified in raw HTML 2026-08-10):** the cell **does carry a nation flag
`<img>`** (e.g. `IT.png`, `_england.png`) — so flag presence does NOT distinguish
Individual from Team; detect the format from the event title instead. Names are
inconsistently cased (mixed case vs ALL CAPS: `Chloe Morse` vs `MILA DEMARQUE`) and
carry accents / curly apostrophes (`Lola LE MÉLINER`, `CJ O’Brien`, U+2019) →
**normalize** (case-fold, NFC, straighten `’`) before using the name as an identity
key. To recover a stable id, join the name to the Teams-tab cards (see below), which
expose a per-rider `team_id`.

**Pairs events (id=4856):** identical table shape to Team (**a nation flag `<img>` IS
present** in the `Team` cell, e.g. `img\country_flags\FR.png`), but the label is a
**single free-text pair label** — not a nation, not a clean rider name. Observed shapes
(verbatim): `EILEEN ET MEHDI`, `HUGO ET FLO`, `TIM ET FLAVIE`, `Laura et Axel`,
`ROMAIN ET LIAM` (two first names joined by French `et`/`ET`), and `TPM DUVERGEAX`,
`TEAM BRICO PREVOST` (a club/team name with no rider names at all). Casing is
inconsistent (ALL CAPS vs Title case) → normalize (case-fold, NFC) before using as a
key, but **do not assume the two riders are recoverable** from the label (club-name
labels carry no rider names; `et`-joined labels give only first names). Join to the
Teams-tab cards to recover the pair's `team_id` and nation.

### Session detail (`&session=<n>`) — per-game scores

2 tables; tbl0 is the primary grid. Cells are `<td>`. Header `<th>` names the games.

```html
<tr><th>Teams</th><th></th><th>Heat</th><th>Speed weavers</th><th>Tool box scramble</th>
    <th>Association race</th> ... <th>Four flag</th><th>Sum</th><th>Points overall</th></tr>
<tr><td><img src="img\country_flags\CZ.png" height="40px"></td><td>Czech Republic U12</td>
    <td>1</td><td>2</td><td>4</td> ... <td>3</td><td>33</td><td>33</td></tr>
```
Field map: col0 = flag, col1 = team label, `Heat` col = heat number, then **one column
per game** (header text = game name), `Sum` = session sum, `Points overall` = cumulative.
tbl1 is the same data styled (`font-family: eraser`) with flag+label merged into one cell.

**Individual events (id=4629):** the session is split into **heats** under
`### Heat <n>` sub-headings (6 heats of ~6 riders in the U12 sample), rendered as
row-groups **inside one `<table>`** (a full-width `Heat N` row, then a fresh header
row, then data rows) — re-read the column map on each header row and take the heat
number from the `Heat` column. The label column holds the **rider name**. Game-name
headers can differ in casing between heats within the same session (`Speed weavers` in
Heat 1 vs `Speed Weavers` in Heat 2) → case-normalize game names. tbl1 variant prepends
a `Points overall` column right after `Heat`.

**Pairs events (id=4856):** also split into **one table per heat** (`<h3>Heat 1..3`
sub-headings, 3 heats in the sample), **but col0 (flag) IS populated** with the pair's
nation flag (unlike Individual). The label column holds the pair label. New relative to
Team/Individual sessions: a **`Penalty Points`** column appears just before `Sum`
(e.g. `... Founders race | Penalty Points | Sum | Points overall`), and the game set
includes pairs-specific games (`Socks and buckets`, `Ball and cone`, `Two Mug`; the
`Pony Pairs` game shows up in the finals). Column layout is otherwise the Team/session
shape (col0 flag, col1 label, `Heat`, one column per game, `Sum`, `Points overall`).

### Final detail (`&final=A&heat=<h>`) — per-game scores + session recap

```html
<tr><th>Teams</th><th></th><th>Session 1</th><th>Session 2</th><th>Session 3</th>
    <th>Session 4</th><th>Speed weavers</th><th>Hilo</th><th>Hoopla</th> ...
    <th>Jousting</th><th>Points overall</th></tr>
<tr><td>[flag]</td><td>England U12</td><td>7</td><td>8</td><td>8</td><td>6</td>
    <td>7</td> ...per game... <td>109</td></tr>
```
Leading `Session 1..N` columns carry the qualification totals; remaining columns are
per-game scores for the final; last col = `Points overall`.

**Pairs events (id=4856, `final=A&heat=1`):** the final table for this event does
**NOT** carry the leading `Session 1..N` recap columns — it goes straight
`Teams | [flag] | <game> | <game> | ... | Penalty Points | Points overall` (no `Sum`
column either; `Points overall` is the final's total). col0 flag is populated. The
final's game set differs from the sessions and includes the pairs-specific game
`Pony Pairs` (`Hilo, Hoopla, Two Mug, Bottle swap, Association race, Litter lifters,
Tool box scramble, Pony Pairs, Ball and cone, Four flag, Penalty Points`). `TODO:`
whether all Pairs finals omit the session-recap columns or this is event-specific.

### Teams (`seite2=event_teams_show`) — the participant list (has IDs)

Bootstrap thumbnail cards, **2 per row**:

```html
<div class="col-md-6 col-xs-12 col-sm-12 thumbnail">
  <img src="img\country_flags\AT.png" class="img-rounded">
  <h4 class="text-center">Austria U12</h4>
  <h5 class="text-center"></h5>            <!-- usually EMPTY -->
  <ul class="list-group"></ul>             <!-- usually EMPTY (no athletes) -->
  <a class="btn btn-default" href="?seite=team_profile&team_id=875">Team profile</a>
</div>
```
Field map:
| Field | Source |
|---|---|
| team label | `h4.text-center` → `nation` + `category` |
| nation flag | `img` filename |
| **team_id** | `a[href*="team_id="]` (the ONLY place team_id is exposed) |
| roster (athletes) | `ul.list-group > li` — **empty in practice → OPAQUE gap** |
| subtitle | `h5.text-center` — usually empty (`TODO:` when populated?) |

**Individual events (id=4629):** the Teams tab lists **one card per rider** instead of
per nation. Each card = rider name (`h4`/`####`), a `Team profile` link exposing a
per-rider **`team_id`** (e.g. Chloe LORENZON → `team_id=21656`), a **`Startnumber`**
(e.g. 25) and — **CORRECTION (raw HTML 2026-08-10)** — a **nation flag** (so individual
riders DO have a nation). The roster `ul.list-group` is empty (the rider is the
participant). Cards are **rendered twice** (responsive layout) → dedupe by `team_id`.
This is the join key for individual events: match the Toplist/session rider-name string
to a Teams-tab card to obtain its `team_id` and start number. Start numbers are
per-event and re-used across events for different riders — they are NOT a global rider
id; `team_id` is.

**Pairs events (id=4856):** the Teams tab lists **one card per pair** (36 cards in the
sample). Each card = pair label (`h4.text-center`, e.g. `EILEEN ET MEHDI`), a nation
flag `<img>` (present, unlike Individual), and a `Team profile` link exposing a
per-pair **`team_id`** (e.g. `EILEEN ET MEHDI` → `team_id=21691`, `BENJ ET AUDE` →
`team_id=21690`, `Charlaine et Vincente` → `team_id=2197`). A `Startnumber:` `<h6>`
label is rendered but was **empty for every card** in this event (`TODO:` confirm
whether other Pairs events populate it). `ul.list-group` roster is **empty** — the two
riders and their ponies are not listed. So the join is the same seam as the other
formats: match the pair-label string in the score tables to a Teams-tab card to obtain
the pair's `team_id` and nation.

### Game list (`seite2=event_gamelist_show`)

Lists the standardized MG games used in the event. `TODO:` capture the exact
container/selector — the served markup embeds the list among nav dropdowns; a targeted
Playwright/DOM read of the main content panel is needed to pin the selector. Game names
themselves are reliably readable from the **session/final table headers** (see above),
which is the more robust source for "which games were played".

### Archive (`index.php?seite=archiv`)

Grouped by month into Bootstrap panels; each event is a `list-group-item` link. Day of
month is in a `<span class="badge">`. **Uses the `index.php?seite=show_event&id=` form.**

```html
<div class="panel panel-default">
  <div class="panel-heading">Juli 2026</div>          <!-- German month + year -->
  <div class="panel-body"><div class="list-group">
    <a class='list-group-item' href='index.php?seite=show_event&id=4388'>
       [flag]<span class='badge'>04</span> RLT Wolteritz OK</a>
    ...
  </div></div>
</div>
```
Field map: panel-heading = `<German month> <year>`; each `a.list-group-item` →
`eventId` (href), day (`span.badge`), nation flag, event name (link text).
**Beware:** the nav dropdowns ("Next five events", "Last five competitions") also emit
`show_event` links on every page — scope parsing to the archive panels
(`div.panel.panel-default`), not to a page-wide href scan.

### Upcoming (`index.php?seite=upcoming`)

Same event-link shape as the archive (future-dated). Dates like `19. Aug 26`.

### Ranking lists (`ger_ranking_list` / `che_ranking_list`)

The bare page is a **chooser**: `a.btn.btn-block` buttons, one per (category, year):

```html
<a ... href="?seite=ger_ranking_list&mode_id=95&y=2026">Deutsche Rangliste U12 2026</a>
<a ... href="?seite=ger_ranking_list&mode_id=93&y=2026">Deutsche Rangliste OK 2026</a>
```
Enumerate `mode_id` + `y` from these buttons. The **resolved** page renders 2 tables
with header `Ranking# | Teams | Points | Competitions` and section rows (an `<h4>`
banner row) splitting `A-Final` vs `Not Qualified`:

```html
<tr><th>Ranking#</th><th>Teams</th><th>Points</th><th>Competitions</th> ...</tr>
<tr><th></th><th><h4>A-Final</h4></th> ... </tr>              <!-- section header row -->
<tr> rank | team label | points | competitions-count | ... </tr>
```
Ranking rows are **team/nation-level**, no athlete links.

## Entities & IDs

| Entity | Identified by | Where exposed | Notes |
|---|---|---|---|
| **Event** | `id` (int) in `?seite=show_event&id=<id>` | everywhere | stable integer |
| **Category** | text suffix of team label (`U12`, `U15`, `OPEN`, ...) + event title | derived | not a separate ID; **one event = one category** here (e.g. 4795 = "Under 12a") |
| **Phase** | `session=<n>` / `final=<X>&heat=<h>` query params | event nav tabs | no numeric phase ID |
| **Team / Participant** | `team_id` (int) in `?seite=team_profile&team_id=<id>` | **ONLY** the Teams tab | polymorphic: a nation-team (Team events), a single rider (Individual events), OR a pair (Pairs events — one free-text pair/club label + nation flag). See gap below |
| **Nation** | flag filename + label prefix | Team, Pairs AND Individual rows/cards | ISO2 or `_home-nation`; **present in all three formats** (Individual flag confirmed in raw HTML 2026-08-10) |
| **Game** | game **name** (string) | session/final table headers, game list | no game ID |
| **Athlete / Rider** | **`team_id`** (Individual events only) | Teams tab + score-row name (Individual events) | Team events publish **no** riders (opaque). Individual events: rider = a `team_id` + name + per-event start number |
| **Horse / Pony** | — | **nowhere** | no horse profile page exists, either format |
| **Ranking mode** | `mode_id` (int) + `y` (year) | ranking chooser buttons | category+year key |

**Critical cross-page join gap:** score tables (Toplist, session, final) render teams
**only as `<nation> <category>` text — with no `team_id`**. `team_id` appears **only**
on the Teams tab. To attach scores to a `team_id`, join score rows to the Teams-tab
cards **by their label string** within the same event. This label join is the seam
where the ingester must be careful (duplicate labels, whitespace, home-nation naming).
The **same seam applies to Individual events**: score rows carry the rider name but no
`team_id`; the per-rider `team_id` lives only on the Teams tab, so the ingester joins
`normalized(rider name) → team_id` within the event. Rider-name collisions across
different people are possible → prefer the `team_id` as the durable identity once joined. **Pairs events behave like this too:**
score rows carry the pair label + nation flag but no `team_id`; the per-pair `team_id`
lives only on the Teams tab, so the ingester joins `normalized(pair label) → team_id`
within the event. Pair labels are the least stable of the three (free-text, `et`-joined
first names OR club names, inconsistent casing) → the label join is most fragile here,
and the underlying two riders/ponies are not recoverable from the source at all.

## Date/Number Formats & Enums

- **Dates (event lists):** `D. Mon YY` — e.g. `19. Aug 26`, `22. Aug 26`.
- **Archive month headers:** **German** month name + full year — `Juli 2026`,
  `Januar 2025`, etc. (German even under `language=en`). Map German month names →
  numbers when parsing the archive.
- **Numbers:** points are plain integers; averages use a dot decimal (`6.43`) and the
  Ø/`&empty;`/`&Oslash;` glyph as the column marker.
- **Flag filenames** (`img\country_flags\<X>.png`, backslashes as served):
  - ISO-3166 alpha-2 uppercase: `AT`, `CZ`, `DE`, `FR`, `IT`, ...
  - **UK home nations use special names:** `_england.png`, `_scotland.png`, `_wales.png`
    (leading underscore, lowercase). Handle these explicitly — they are NOT ISO codes.
- **Category / age-band vocabulary** (from labels + ranking buttons):
  `OPEN` (a.k.a. `OK` = *Offene Klasse* in German ranking buttons), `U12`, `U14`,
  `U15`, `U17`, `U18`. Event titles append variants like `Under 12a`, `Under 15s`,
  `Under 18s`. `TODO:` confirm full set incl. `PRO`, `Pairs`/`Individual` distinctions
  on a Pairs/Individual event (id=4795 is Team only).
- **Format vocabulary:** events are `Team Championships`, `Individual Championships`,
  `Pairs` (many in archive: "CLUB ELITE PAIRES", "European Pairs", "IMGA World Pairs",
  ...). **Individual confirmed (id=4629): label = rider name, WITH a nation flag.**
  **Pairs confirmed (id=4856): label = one free-text pair label (`et`-joined first
  names OR a club name) WITH a nation flag; two riders never structured.** Note the
  archive has an edge case "Celtic Pairs Under 12 (Individual)" (a pairs series scored
  as individuals) — treat format by the actual page structure, not the title word.
- **Phase vocabulary:** `Session <n>` (n=1..4 Team, 1..3 Individual U12, 1..3 Pairs
  id=4856), `Heat <h>` (sessions are split per-heat in Individual and Pairs). Finals:
  Team uses `Final A`/`Final B`; **Individual uses tiered finals `Final A..F` (one heat
  each) plus a `Semifinal`** (`final=semifinal`, no `heat`); **Pairs (id=4856) uses
  tiered finals `Final A|B|C` (one heat each), NO semifinal.** Ranking sections:
  `A-Final`, `Not Qualified`.
- **Game vocabulary** (observed across U12 Team/Individual/Pairs; names are the join
  key, no IDs):
  Speed weavers, Tool box scramble, Association race, Bottle exchange, Litter lifters,
  Hula hoop, Mug Changes, Windsor Castle, Bang a balloon, Four flag, Hilo, Hoopla,
  Mug shuffle, Founders race, Bottle shuttle, Three mug race, Two flag race, Jousting,
  Socks and buckets, Ball and cone, Bottle, Bottle swap, Two Mug, **Pony Pairs**
  (pairs-specific). Pairs tables also carry a **`Penalty Points`** column (a deduction,
  not a game) just before `Sum`/`Points overall`. `TODO:` game-name spelling varies
  slightly across events/categories/heats — normalize.

## Opaque Data / Gaps

This source is **team/nation-level for Team events** (the primary driver of the
crowdsourcing layer), **rider-level for Individual events**, and **pair-level (opaque
about the two riders) for Pairs events**:

1. **Team events: no athletes, ever.** In a Team event a "team" is a **nation + age
   category** (`England U12`) and the Teams-tab roster `<ul class="list-group">` is
   **empty** — who actually rode is not published → crowdsourcing must supply riders.
   **Individual events are the exception:** riders are named and carry a `team_id`
   (see Data Views → Teams tab), so no crowdsourcing is needed to know *who* competed.
2. **No horses/ponies, either format.** Not modelled or displayed anywhere, including
   individual events → horse identity always needs crowdsourcing on this source.
3. **Team profile is thin:** `team_profile&team_id=<id>` shows only the label, "Last
   competitions", "Successes", and an average-points figure — no roster.
4. **Score rows lack team_id** (see Entities) — the score↔team_id link is a fragile
   label join our ingester must own, for both Team (nation label) and Individual
   (rider-name label) events.
5. **Pairs events: the two riders are opaque.** Confirmed on id=4856: a pair is a
   single free-text label (`EILEEN ET MEHDI`, `Laura et Axel`, or a club name like
   `TPM DUVERGEAX`/`TEAM BRICO PREVOST`) + a nation flag + a per-pair `team_id`. The
   individual riders are **not** structured (at best two first names embedded in the
   label; often no rider name at all), the roster `<ul>` is empty, `Startnumber` was
   empty, and ponies are absent → crowdsourcing must supply *who* the two riders are
   (and their ponies) for Pairs, just as it must for Team events.

## Open Questions / TODO

- `TODO:` Confirm via Playwright `browser_network_requests` on a **live** event that
  Refresh triggers no score XHR (static evidence: it does `location.reload`).
- `TODO:` Pin the `event_gamelist_show` main-content selector (served markup mixes it
  with nav); meanwhile derive games from session/final headers.
- **DONE (2026-08-09):** Individual event captured (id=4629) — rider names + per-rider
  `team_id` + start numbers confirmed, no horses.
- **DONE (2026-08-10):** Pairs event captured (id=4856) — pair label shape (`et`-joined
  first names OR club name) + nation flag + per-pair `team_id` confirmed; two riders
  and ponies opaque; `Startnumber` empty; sessions split per-heat; tiered finals A|B|C
  with no semifinal; `Penalty Points` column + `Pony Pairs` game. `TODO:` confirm
  whether all Pairs finals omit the `Session 1..N` recap columns (id=4856 did) and
  whether any Pairs event populates `Startnumber`.
- `TODO:` Locate where structured event **metadata** (venue, exact dates, organizer,
  level national/European) lives — `event_info` served mostly modal boilerplate; it may
  be in the main page header region not captured here.
- `TODO:` Enumerate the full **category enum** incl. `PRO` and any `Under 12a/12b`
  splits; document how a/b sub-divisions map to our Category model.
- `TODO:` Verify `che_ranking_list` shares the exact GER structure (assumed, unconfirmed).
- `TODO:` Confirm whether sending `Cookie: language=en` fully forces English (some
  strings, e.g. archive months, stay German regardless).
- `TODO:` Determine how many sessions a non-U12 event has (session count is per-event;
  read it from the nav tabs, never hard-code 4).

---

## Re-verification 2026-09-30

Re-verified against the live site ahead of the spec-04 parser rewrite (Phase B).
**Method:** plain HTTP GET (no JS, no Playwright) of the archive, upcoming, and a live
event/toplist page — i.e. exactly production's `fetch` + `cheerio` path. Everything
below survives without JavaScript; **no JS-only content was encountered**. Focus is the
spec-04 fields only. Prior baseline (discovery 2026-08-09/10) unless noted.

Pages checked:
- Archive: `https://www.mg-scoreboard.de/index.php?seite=archiv`
- Upcoming: `https://www.mg-scoreboard.de/index.php?seite=upcoming`
- Event/Toplist (Team, currently live): `?seite=show_event&id=4863&seite2=event_points_list_show`
  ("World Team Championships 2026 - U18")

### 1. mg DATES — **CONFIRMED (with one clarification the dev must not miss)**

- **Event page carries NO date** — re-confirmed on id=4863: the toplist page renders
  only the title, the tab bar, and the score tables. No date string anywhere. The
  discovery-time threading premise (date lives on the LIST pages, carried forward on the
  scrape target) still **holds**.
- **Archive month panels** — **CONFIRMED**. Grouped into panels whose heading is a
  **German** month name + full year, and this stays German even though the default UI is
  English (`Cookie: language=en`). Headings observed this run (verbatim):
  `September 2026`, `August 2026`, `Juli 2026`, `Juni 2026`, `Mai 2026`, `April 2026`,
  `März 2026`, `Februar 2026`, `Januar 2026`, and older `Dezember/November/Oktober …`.
  So the `DE_MONTHS` map is still required and must cover:
  `Januar, Februar, März, April, Mai, Juni, Juli, August, September, Oktober, November,
  Dezember`. Each event within a panel is an `a.list-group-item` with the day-of-month in
  a leading `span.badge` (values seen: `05`, `03`, `19`, `26`, `12`, `04`, …) and the
  `index.php?seite=show_event&id=<N>` link form. **All CONFIRMED unchanged.**
- **`D. Mon YY` inline format — CONFIRMED, but ⚠️ CLARIFICATION on WHERE it appears.**
  The English-abbrev `D. Mon YY` string (e.g. `3. Oct 26`, `Sep 26`) is emitted in the
  **nav dropdowns** ("Next five events" under *Up coming competitions*, "Last five
  competitions" under *Archive*) — NOT in the main list panels. The **main `?seite=upcoming`
  panel uses the SAME structure as the archive**: German month + year headings
  (`Oktober 2026`, plus junk-data panels like `Mai 3000`) with a day-badge per event, NOT
  an inline `D. Mon YY`.
  **Action for the dev:** the spec-04 design says "Upcoming: parse the inline `D. Mon YY`
  (English abbrev month) on the link text." That matches the **nav-dropdown** links, not
  the main upcoming panel. If `parseEventEntries` for upcoming scrapes the **main panel**
  (`div.panel…` + `span.badge` + German heading), it should reuse the SAME
  German-month + day-badge path as the archive, and `parseUpcomingDate("19. Aug 26")`
  only applies if it is instead reading the nav-dropdown link text. Pick the source
  deliberately; do not assume the main upcoming panel is inline-dated. (`19. Aug 26`-style
  strings were NOT seen in the main upcoming panel this run — only in the nav dropdown.)

### 2. mg TITLE / GROUPING (age band baked into title) — **CONFIRMED**

The event title bakes in the age band and often the format word and a 4-digit year. Both
**prefix** and **suffix** band placements occur, plus spaced bands (`U 12`, `U 18`) and
`Reserve`. 12 real **current** titles captured verbatim from this run (archive/upcoming,
Aug–Oct 2026) for the dev to validate the strip/grouping regex against:

1. `IMGA European Team Championships 2026 - Under 12a`   (suffix, spaced "Under 12a", year in title)
2. `IMGA European Individual Championships 2026 - Under 15` (suffix "Under 15", format word "Individual")
3. `World Team Championships 2026 - U18`                  (suffix `U18`)
4. `World Team Championships 2026 - Reserve Individuals`  (suffix `Reserve` + format word `Individuals`, no age band)
5. `U 12 WPC 2026`                                        (**prefix** spaced `U 12`, year, WPC)
6. `OPEN WPC 2026`                                        (**prefix** `OPEN`)
7. `RLT Wittorfer Kibro's OK`                             (suffix `OK` = Offene Klasse; German RLT)
8. `Inter-counties Championship 2026 U12`                 (suffix `U12`, no separator before band)
9. `Intercounties Championships 2026 - Musketeers`        (suffix `Musketeers` band)
10. `OÖM - ÖM - Individuals - Einsteiger`                 (format word `Individuals` mid-title, `Einsteiger` band)
11. `2026 Southern Series Pairs - Green Pony`             (**prefix** 4-digit year, `Pairs` format word, `Green Pony` band)
12. `AMGA Individual Championship Camden 25 & over`       (suffix `25 & over` band; `Individual` format word)

Notes for the regex:
- Age-band tokens seen: `U12/U15/U17/U18`, spaced `U 12`/`U 15`/`U 18`, `Under 12a`,
  `Under 15s`, `Under 18s`, `OPEN`/`OK`, `Einsteiger`, `Musketeers`, `Reserve`,
  `Green Pony`, `Novice`, `Intermediate`, `25 & over`, `Elite`, `Indice 1`, French club
  bands (`Club Elite`, `Major`, `Cadet`, `Minime`, `Benjamin`, `Senior`, `Poussin`).
- Format words seen: `Team(s)`, `Individual(s)`, `Pairs`, `Paires`/`PAIRES`, `Coppie`
  (rare), `Squadre` (rare).
- A **4-digit year** appears in the majority of titles (`2026`, `2025`, …) but NOT all
  (e.g. `RLT Wittorfer Kibro's OK` has none) — hence the spec's fallback chain
  (startsOn year → year-in-title → none) is the right call.
- Edge cases still present: `Celtic Pairs Under 12 (Individual)` (a pairs series scored
  as individuals) and junk/test panels (`Mai 3000`, `TEST TEST 01 06 26`, `wp`).

### 4. LEVEL inference vocabulary — **CONFIRMED / enriched from live titles**

Real title vocabulary observed this run, mapped to the spec-04 `inferLevel` tiers:

- **international**: `IMGA`, `World Team/Individual Championships`, `WPC`, `WTC`
  (`Supporter Cup WTC`), `European Team/Individual/Pairs Championships`, `Home
  International`, `Nations Championship`, `Scandinavian Championships`, `Nordic Team
  Championships`, `International of Ghlin`, `Royal Welsh - International`.
- **national**: `Deutsche Einzelmeisterschaft`, `Deutsche Paarmeisterschaft`,
  `Championnat de France`, `British Individuals/Pairs`, `England Championships`,
  `Scottish Championships`, `Welsh Championships`, `Irish Team/Pairs Championships`,
  `Swiss/Swiss Team Championship`, `Championat` (Austrian), `SM/NM` (Swedish/Norwegian
  champs), `AMGA National`, `PCA National`. (National marker + championship word, per the
  spec's two-part rule.)
- **regional**: `RLT …` (German Ranglistenturnier — very common), `Intercounties`/
  `Inter-counties`, `MGAWA`, `AMGA VIC`, `AMGANSW`, `MGA Scotland Winter League`,
  `Midlands Series`, `Southern Series`, `Winter Series`, `4 Regioni`-style, `State
  Championships`.
- **club / weak**: `Friendly`, `Club`, `Club Elite`, `Starter`, `Development League`,
  `Training`/`Träningsklasse`, `Trophy`, `Cup`, `Show`, `Snowbird`.

### Verdict — mg-scoreboard.de: **parsers SAFE to rewrite as-designed**, with ONE caveat

Selectors, German-month archive headings, day badges, title band-baking, and the
"event page has no date" premise are all **unchanged** from the baseline. The only thing
the dev must decide deliberately (not a drift, a design clarification): the `D. Mon YY`
inline date lives in the **nav dropdowns**, while the **main upcoming panel is
German-month + day-badge** like the archive — so upcoming date parsing should mirror the
archive path unless the parser specifically reads the nav-dropdown links. No JS-only
content; `fetch` + `cheerio` remains sufficient.

Suggested commit:
`docs(sources): :memo: re-verify mg-scoreboard spec-04 fields (2026-09-30) — dates/titles/level confirmed, upcoming-panel date-source clarified`
