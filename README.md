# Mounted Games

A mobile-first web portal for **live scoring, results archive and statistics** of the
Mounted Games equestrian discipline, at Italian and European level.

No official data feed exists for this discipline. Results live on two third-party
portals that are the de-facto sources. This portal **polls** those sources, normalizes
the data into its own relational model, and adds what the originals lack: statistics
and profiles for athletes, horses, teams and nations, plus a crowdsourcing layer to
fill in data the sources hide behind opaque labels.

## Features

- **Live scoring** — near-real-time scoreboards during competitions.
- **Results archive** — historical competitions, categories and placements.
- **Profiles & statistics** — athletes, horses, teams and nations, with cross-entity
  stats built from relational joins.
- **Crowdsourcing** — authenticated contributors can submit and refine data the sources
  expose only partially (e.g. a team shown only as "Italy" with no athletes), subject to
  approval.
- **Internationalization** — Italian and English (`next-intl`, locale as the URL root).

## Tech stack

- **Framework:** [Next.js](https://nextjs.org) 16 (App Router, Turbopack, Server Actions)
  — a monolith hosting the frontend, API routes and the ingestion route in one app.
- **UI:** [shadcn/ui](https://ui.shadcn.com) + [Tailwind CSS](https://tailwindcss.com),
  mobile-first, dark mode via `class` strategy.
- **Auth:** [Better Auth](https://www.better-auth.com) (Drizzle adapter) — powers the
  contributor flow.
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) via
  [Drizzle ORM](https://orm.drizzle.team). Monetary values are stored as integer cents.
- **Scraping:** native `fetch` + [cheerio](https://cheerio.js.org) in production.
  Playwright is used only during the discovery phase, never in the production poller.
- **Runtime / hosting:** [Cloudflare Workers](https://workers.cloudflare.com) via
  [OpenNext](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`). A
  [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
  drives the poller; a KV namespace gates it to live windows.
- **Lint/format:** [Biome](https://biomejs.dev). **Tests:** [Vitest](https://vitest.dev).
  **Package manager:** npm.

## Architecture

### Ingestion (outside the request cycle)

The poller is a Worker invoked on a **Cron Trigger** (every minute). It does **bounded
work per tick** (the few stalest live targets, not a whole event), uses a per-fetch
timeout (`AbortSignal`), and is **gated to live windows** via KV — outside a competition
it returns immediately, so idle ticks cost KV reads and zero database work.

Production scrapers parse server-rendered HTML with `cheerio`. Each source sits behind a
shared `Scraper` interface and a registry; the parsing logic is kept library-agnostic.
URL patterns, selectors and field mappings are reverse-engineered and documented in
`docs/sources/*.md`, which is the scrapers' source of truth.

### Data model

The sources' data is normalized into a vendor-neutral relational schema (Drizzle), kept
portable (no vendor-specific SQL features). Cross-entity statistics are computed with
joins across athletes, horses, teams, nations and competitions.

## Data sources & privacy

This project aggregates publicly available competition results from third-party portals
and adds a crowdsourcing layer. Data about individuals (athletes, team members) is
limited to what is already public on the source portals or voluntarily contributed. The
project is not affiliated with, endorsed by, or an official feed of the source portals
or any governing body of the discipline. If you are a data subject and want data
corrected or removed, open an issue.

## Getting started

```bash
npm install
npm run dev        # Next.js dev server (Node runtime)
```

Common scripts:

```bash
npm run lint       # Biome check
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run build      # next build
npm run preview    # OpenNext build + local Workers preview (workerd)
npm run deploy     # OpenNext build + deploy to Cloudflare Workers
```

### Environment & secrets

Runtime secrets are **not** committed. They are provided as Cloudflare Worker secrets:

- `CRON_SECRET` — bearer token protecting the poller/seed/admin routes.
- `BETTER_AUTH_SECRET` — Better Auth signing secret.
- `BETTER_AUTH_URL` — the deployed origin.
- Source base URLs for the scrapers.

Set them with `npx wrangler secret put <NAME>`. See `docs/deploy-cloudflare.md` for the
full deployment runbook.

## CI/CD

GitHub Actions, with a strict trunk-based flow:

- **CI** (`.github/workflows/ci.yml`) runs lint + typecheck + tests on every pull
  request and is a required status check — `main` is protected and merges only with a
  green gate.
- **Release Please** (`.github/workflows/release-please.yml`) reads conventional commits
  on `main` and maintains a release PR that bumps the version and the changelog; merging
  it cuts a `vX.Y.Z` tag and a GitHub Release.
- **Deploy** (`.github/workflows/deploy.yml`) deploys to Cloudflare Workers when a
  release is published (from the release tag). Required repo secrets:
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Commits follow [Conventional Commits](https://www.conventionalcommits.org) with gitmoji
text codes.

## License

[MIT](./LICENSE) © Niccolò Olivieri Achille
