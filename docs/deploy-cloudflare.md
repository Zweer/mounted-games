# Cloudflare deploy runbook — Phase D

Everything here is **run by the developer** on their own machine against their
Cloudflare account. The agent never deploys, never applies remote migrations,
never runs `wrangler secret put`. This is a copy-paste checklist.

Prereqs: `wrangler` is authenticated (`npx wrangler login`) and the account has a
Workers Paid or free plan that allows Cron Triggers, D1 and KV.

---

## 1. Create the remote D1 database + KV namespace (once)

```sh
# D1 — copy the printed database_id into wrangler.jsonc d1_databases[0].database_id
npx wrangler d1 create mounted-games-db

# KV — copy the printed id into wrangler.jsonc kv_namespaces[0].id
npx wrangler kv namespace create mounted-games-poller-kv
```

Then edit `wrangler.jsonc`, replacing the two local placeholders:

- `d1_databases[0].database_id`: `"local-mounted-games"` → the real D1 id
- `kv_namespaces[0].id`: `"local-poller-kv"` → the real KV id

(Leave `binding`, `database_name`, `migrations_dir` as they are: `binding` is
what the code reads — `env.DB` / `env.POLLER_KV` — and must not change. The
physical resource names above are `mounted-games-db` / `mounted-games-poller-kv`
so they read clearly in the Cloudflare dashboard.)

## 2. Upload the secrets (once, and whenever they rotate)

These are the Workers-runtime secrets the app reads via `getSecret()` /
`getEnv()`. They are **not** in any committed file — `.dev.vars.example` only
documents them for local runs. Run each and paste the value when prompted:

```sh
npx wrangler secret put BETTER_AUTH_SECRET       # openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_URL          # e.g. https://mounted-games.<subdomain>.workers.dev (no trailing slash)
npx wrangler secret put CRON_SECRET              # random token; guards the manual /api/poll, /api/seed, /api/admin/reset
npx wrangler secret put MG_SCOREBOARD_BASE_URL   # https://mg-scoreboard.de
npx wrangler secret put PMG_LIVESCORE_BASE_URL   # https://pmglivescore.altervista.org
```

`DB` (D1) and `POLLER_KV` (KV) are **bindings**, not secrets — they are declared
in `wrangler.jsonc` (step 1), not uploaded here.

## 3. Apply the schema to the remote D1

The baseline SQLite migration lives at `db/0000_*.sql` (`migrations_dir: "db"`
in wrangler.jsonc).

```sh
npx wrangler d1 migrations apply mounted-games-db --remote
```

(Add `--local` instead of `--remote` to seed a Miniflare-backed local D1 for
`wrangler dev` / preview.)

## 4. Build + deploy the Worker

`main` is `custom-worker.ts` (the fetch+scheduled wrapper). `opennextjs-cloudflare`
builds the Next output, then bundles the custom worker as the entrypoint.

```sh
# Build only (produces .open-next/ + bundles custom-worker.ts):
npm run cf:build

# Preview locally against Miniflare (fetch + a manual scheduled trigger):
npm run preview
#   then, in another shell, exercise the cron path locally:
#   curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"

# Deploy to Cloudflare (build + deploy):
npm run deploy
```

## 5. Clean seed on the empty D1 (D6 — absorbs spec 04/R5 backfill)

The remote D1 starts empty, so the seed is non-destructive by construction (no
reset needed). Ingest with the corrected Phase B scrapers:

```sh
# Bootstrap the scrape_target table from both sources' event lists.
# Seeds targets idle by default; the live-window pass flags running events.
curl -X POST "https://<your-worker-url>/api/seed" \
  -H "Authorization: Bearer $CRON_SECRET"

# (Optional) trigger one poll tick immediately instead of waiting for the cron:
curl -X POST "https://<your-worker-url>/api/poll" \
  -H "Authorization: Bearer $CRON_SECRET"
```

The Cron Trigger (`* * * * *`, wrangler.jsonc `triggers.crons`) then drives the
poller automatically every minute. The `scheduled` handler is **not** publicly
routable, so it needs no `CRON_SECRET`; the secret only guards the manual HTTP
routes above.

## 6. Verify live (D6 / D8)

- Hit the site: `/` → 307 → `/it`; DB-backed pages render localized copy.
- Chronological ordering, grouped multi-band events, level badges, working
  recent-result links (the Phase B fixes) on real data.
- Cron firing: `npx wrangler tail mounted-games` and watch for scheduled
  invocations once a minute.
- **Cost check (D8):** in the Cloudflare dashboard, confirm that off-season the
  minute tick shows KV reads but **no D1 reads** — the idle gate
  (`poller:is-live == "0"`) is the core cost fix. During a live event, D1
  read/writes resume as targets are polled.

## Notes

- **Idle gate cadence:** `refreshLiveWindow` (source-hitting + D1) is throttled
  to every ~5 min via `poller:next-refresh` (`LIVE_WINDOW_TTL_MS`), independent
  of the 1-minute cron. Bump `LIVE_WINDOW_TTL_MS` in `lib/ingest/live-window.ts`
  to poll the sources less often when nothing is live.
- **Cron cadence:** change `triggers.crons` in `wrangler.jsonc`. `* * * * *`
  matches `DEFAULT_LIVE_POLL_INTERVAL_MS` (60s) for minute-fresh live scores.

## 7. Troubleshooting — deployed Worker returns 404 on every route

**Symptom:** after `npm run deploy`, every route on
`https://mounted-games.<subdomain>.workers.dev` returns HTTP 404 (including
`/api/poll`, no i18n), while `npm run preview` serves the same build correctly.
The dashboard shows the Worker bound to the hostname (Domains 1, a `fetch()`
trigger) with all bindings and the cron present — yet every request 404s.

**Root cause — the custom worker used NAMED exports instead of a DEFAULT
export.** `custom-worker.ts` exposed `export const fetch = …` / `export {
scheduled }`. OpenNext's custom-worker how-to prescribes a **default export
object** (`export default { fetch, scheduled }`;
https://opennext.js.org/cloudflare/howtos/custom-worker). This is not cosmetic:
on a **Worker-with-Assets** deploy, Cloudflare's static-assets routing layer
attaches to the Worker's **default export**. With only named exports, the
deployed asset router never hands asset-miss navigations (`/`, `/it`) or `/api/*`
to the Worker — so the edge returns a bare 404 and the Worker is never invoked.
`wrangler dev` / `opennextjs-cloudflare preview` run on **Miniflare**, which is
lenient about the export shape, so preview served correctly and masked the bug —
exactly why "preview passes, deploy 404s."

**Header evidence (how this was pinned):** the deploy 404 carried ONLY
Cloudflare edge headers — `server: cloudflare`, `content-type: text/html`, the
legacy `cache-control: …post-check=0, pre-check=0`, `expires: Thu, 01 Jan 1970`,
`x-frame-options: SAMEORIGIN`, `referrer-policy: same-origin` — and **no
OpenNext/Next header** (`x-opennext`, Next cache headers). A control `curl`
against a nonexistent `*.workers.dev` host returned the *same* header set (incl.
`x-frame-options`), proving those are Cloudflare's edge-placeholder headers, not
application headers, and that **the Worker was not invoked**. The dashboard's
`fetch()` trigger showed the Worker was *bound* but the assets router in front
of it was not routing to it → the named-export shape.

**Live diagnostic (developer runs — decisively separates the two cases):**

```sh
# Terminal 1 — stream the deployed Worker's invocations:
npx wrangler tail mounted-games --format pretty
# Terminal 2 — hit the site:
curl -sI https://mounted-games.<subdomain>.workers.dev/
```

- **No invocation line appears in tail** ⇒ the edge/asset layer answered without
  invoking the Worker → the export-shape bug (this fix). This is the case that
  matched here.
- **An invocation appears WITH a 404** ⇒ the Worker ran and OpenNext's router
  itself returned 404 → a different problem (routing/build), not this one.

**Fix applied:** `custom-worker.ts` now uses the documented default-export shape:

```ts
export default {
  fetch: openNextHandler.fetch,
  scheduled,
} satisfies ExportedHandler<WorkerEnv>;
// Durable Objects stay NAMED exports (Cloudflare binds DOs by class name):
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
```

**Re-verify (developer runs — from a clean artifact):**

```sh
# Clean rebuild so no stale .open-next artifact is deployed, then deploy:
rm -rf .open-next && npm run deploy

# Confirm the Worker now handles routing (not Cloudflare's placeholder):
curl -sI https://mounted-games.<subdomain>.workers.dev/          # expect 307 -> /it
curl -sI https://mounted-games.<subdomain>.workers.dev/it        # expect 200
curl -sI https://mounted-games.<subdomain>.workers.dev/api/poll  # expect 401 (no CRON_SECRET), NOT 404
# And confirm the Worker is now invoked:
npx wrangler tail mounted-games --format pretty   # should now show an invocation per request
```

Success = `/` → 307 to `/it` (next-intl root redirect), `/api/poll` → 401 (the
CRON_SECRET guard ran ⇒ the Worker executed), and `wrangler tail` shows
invocations.

**Config note:** `compatibility_flags` also gained `global_fetch_strictly_public`
(required by the OpenNext template for the Worker's self-referencing fetches —
`WORKER_SELF_REFERENCE`, ISR revalidation, the image handler's
`env.ASSETS.fetch`). Correctness alignment, independent of the 404 fix.
