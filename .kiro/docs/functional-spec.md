# Functional Spec — mounted-games

## Vision

A mobile-first, visually striking web portal for the **Mounted Games** equestrian
discipline, covering the **Italian and European** scene. It provides **live scoring**,
a **results archive**, and **statistics & profiles** that the existing sources lack —
for athletes, horses, teams and nations.

## Problem

Results today live on two third-party portals that work poorly and expose only raw
scores, no cross-entity statistics, and often hide who actually competed (an
international team may appear only as "Italy" with no athletes listed):

- **mg-scoreboard.de** — German, PHP; the richest source (IMGA European/World
  championships), server-rendered HTML with predictable query params.
- **pmglivescore.altervista.org** — Italian, WordPress; archive + timetable, fed by an
  XML import.

There is **no official API**. Our portal polls these sources, normalizes the data into
its own relational model, and layers on statistics + a crowdsourcing correction flow.

## Goals

1. **Live** — near-real-time scoreboard during competitions (few-minutes latency v1).
2. **Archive** — browsable history of competitions, categories, phases and results.
3. **Statistics & profiles** — aggregated views per athlete, horse, team, club, nation
   (podiums, participation, trends, head-to-head) built on relational joins.
4. **Crowdsourcing** — registered + approved contributors fill gaps the sources hide
   (e.g. the athletes behind an opaque "Italy" team), with a moderation/approval flow
   and edit history.
5. **Mobile-first, attractive** — a polished, fast, installable experience.

## Non-Goals (v1)

- Running/scoring competitions ourselves (we ingest, we don't officiate).
- Real-time WebSocket push — v1 uses client polling of our own API; SSE is a later
  optimization.
- Entry/registration for competitions (that stays on the source portals).
- Betting, payments, or e-commerce.

## Core Entities (high level — schema finalized after source discovery)

- **Competition** (venue, dates, organizer, level: national/European)
- **Category** (age band × format: Individual / Pairs / Team; e.g. OPEN PRO, U18)
- **Phase** (Session 1..N, Semifinal, Final A/B) → **Heat** (batteria)
- **Participant** (Team | Pair | Rider) with **Result** / **Score** per game
- **Game** (the standardized MG games)
- **Athlete**, **Horse/Pony**, **Team**, **Club**, **Nation**
- **Ranking** (national, European, seasonal)
- **Crowdsourcing:** `Contributor` (user + role/status), `Contribution` (proposed
  edit + moderation state + history)

## Architecture (v1)

- **Monolith Next.js on Vercel**: frontend + API routes + the ingestion route.
- **Neon PostgreSQL + Drizzle** (relational, vendor-neutral).
- **Auth:** Better Auth (Drizzle adapter) for the contributor flow.
- **Ingestion:** `/api/poll` route pinged by an external scheduler (cron-job.org first,
  migratable to AWS Lambda + EventBridge). Bounded work per tick, per-fetch timeout,
  gated to live windows.
- **Scraping:** `fetch` + `cheerio` per the `docs/sources/*.md` contract. Playwright is
  used only for discovery, never in production.
- **Live delivery:** client polls our own API every ~10-15s; SSE later if warranted.

## Roadmap (specs)

- `00-setup` — project scaffold (Next.js, Tailwind, shadcn, Neon+Drizzle, Better Auth,
  Biome, hooks, CI).
- `01-ingestion` — source discovery + scrapers + poller (bounded, gated) + upsert/dedup.
- `02-schema-stats` — full relational model + statistics queries + profile pages *(planned)*.
- `03-live-archive` — live scoreboard + archive browsing UI *(planned)*.
- `04-crowdsourcing` — contributor registration, approval, edit history *(planned)*.
- `05-polish` — mobile-first design pass, PWA, SEO *(planned)*.
