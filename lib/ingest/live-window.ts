import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";
import { getEnv } from "@/lib/runtime/workers-env";
import { getScraper } from "@/lib/scrapers/registry";
import type { SourceKind } from "@/lib/scrapers/types";
import { syncTargets } from "./discover";

const SOURCES: SourceKind[] = ["mg-scoreboard", "pmglivescore"];

/** Per-source regex that extracts the native event id from a target url. */
const NATIVE_ID_RE: Record<SourceKind, RegExp> = {
  "mg-scoreboard": /[?&]id=(\d+)/,
  pmglivescore: /[?&]post_id=(\d+)/,
};

// ---------------------------------------------------------------------------
// KV idle gate (Phase D — D2)
// ---------------------------------------------------------------------------
//
// The scheduled poller ticks every minute (see wrangler.jsonc + custom-worker).
// Off-season that minute tick must cost NOTHING at the database: a D1 query per
// tick, forever, is the exact cost this migration set out to remove. So the hot
// path reads two KV keys instead of hitting D1:
//
//   poller:is-live      "1" | "0"   — is any target live right now?
//   poller:next-refresh  epoch ms    — when the authoritative recompute is due.
//
// `refreshLiveWindow` (the coarse, source-hitting recompute) is the ONLY writer
// of these keys, so the KV flag can never drift from the D1 truth by more than
// one refresh interval. When there is no KV binding (Vitest, plain `next dev`
// on Node before local bindings are wired, any tsx script) every helper falls
// back to the original D1 behavior, so tests stay green without Miniflare.

/** KV key: `"1"` when at least one target is currently live, else `"0"`. */
export const KV_IS_LIVE = "poller:is-live";
/** KV key: epoch-ms deadline after which the live window must be recomputed. */
export const KV_NEXT_REFRESH = "poller:next-refresh";

/**
 * How stale the cached `is-live` flag may get. `refreshLiveWindow` stamps
 * `poller:next-refresh = now + this`; the scheduled handler recomputes once the
 * deadline elapses. Kept coarser than the 1-minute live tick so an idle season
 * touches the sources only every few minutes, never D1 on the quiet ticks.
 */
export const LIVE_WINDOW_TTL_MS = 5 * 60_000;

/** The KV binding for the idle gate, or `undefined` under Node/test. */
function pollerKv(): KVNamespace | undefined {
  return getEnv().POLLER_KV;
}

/**
 * Authoritative D1 read: is any target flagged live? This is the pre-Phase-D
 * behavior, kept as the source of truth `refreshLiveWindow` writes into KV and
 * as the fallback when no KV binding exists.
 */
async function hasLiveTargetsFromDb(): Promise<boolean> {
  const rows = await db
    .select({ id: scrapeTarget.id })
    .from(scrapeTarget)
    .where(eq(scrapeTarget.isLive, true))
    .limit(1);
  return rows.length > 0;
}

/**
 * Live-window gate: is there anything live to scrape right now?
 *
 * Hot path (Workers, KV bound): a single KV read of `poller:is-live`. When the
 * key is missing (first ever tick, or the flag was never written) it falls back
 * to the D1 read once and seeds KV so subsequent idle ticks are free. Off-season
 * this performs ZERO D1 queries — that is the whole point of the idle gate.
 *
 * Fallback path (no KV binding — Vitest / Node dev): the original D1 query, so
 * behavior is identical to before Phase D.
 */
export async function hasLiveTargets(): Promise<boolean> {
  const kv = pollerKv();
  if (!kv) return hasLiveTargetsFromDb();

  const flag = await kv.get(KV_IS_LIVE);
  if (flag === "1") return true;
  if (flag === "0") return false;

  // Cold cache: derive once from D1 and seed KV so future idle ticks are free.
  const live = await hasLiveTargetsFromDb();
  await kv.put(KV_IS_LIVE, live ? "1" : "0");
  return live;
}

/**
 * Whether the authoritative live-window recompute is due.
 *
 * The scheduled handler calls this cheaply every tick to decide if it should run
 * the (source-hitting, D1-writing) `refreshLiveWindow`. With KV bound it is a
 * single KV read of `poller:next-refresh`; a missing or elapsed deadline means
 * "recompute now". Without KV it always returns `true` and the existing
 * `claimScheduledTask` interval gate (in poll.ts) throttles instead — so Node
 * behavior is unchanged.
 */
export async function isLiveWindowRefreshDue(
  now = Date.now(),
): Promise<boolean> {
  const kv = pollerKv();
  if (!kv) return true;
  const raw = await kv.get(KV_NEXT_REFRESH);
  if (!raw) return true;
  const due = Number.parseInt(raw, 10);
  return Number.isNaN(due) || now >= due;
}

/**
 * Recompute `is_live` for every target straight from the sources' own
 * "in-progress" lists (mg "Current competitions" nav; pmg home cards with
 * `gara-stato--in_corso`). Fully automatic — no dates, no manual flag: an event
 * turns live when it appears in the current list and turns idle by itself when
 * it drops off. A source that is unreachable is left untouched (no flapping).
 *
 * Also ensures the live entry targets exist (a brand-new live event is polled
 * immediately, before the next bootstrap seed).
 *
 * Phase D: this is the authoritative writer of the KV idle-gate keys. After the
 * D1 truth is recomputed it stamps `poller:is-live` and a fresh
 * `poller:next-refresh` deadline, so the cheap hot path (`hasLiveTargets`) can
 * answer future ticks from KV alone.
 */
export async function refreshLiveWindow(signal: AbortSignal): Promise<void> {
  for (const source of SOURCES) {
    let liveIds: Set<string>;
    try {
      const liveEntries = await getScraper(source).listLiveEvents(signal);
      // Make sure the running events are present and flagged live.
      await syncTargets(source, liveEntries, { isLive: true });
      liveIds = new Set(
        liveEntries
          .map((t) => t.url.match(NATIVE_ID_RE[source])?.[1])
          .filter((id): id is string => Boolean(id)),
      );
    } catch {
      // Source unreachable this tick: leave existing flags as-is.
      continue;
    }

    const rows = await db
      .select({ id: scrapeTarget.id, url: scrapeTarget.url })
      .from(scrapeTarget)
      .where(eq(scrapeTarget.source, source));

    const live: number[] = [];
    const idle: number[] = [];
    for (const row of rows) {
      const nativeId = row.url.match(NATIVE_ID_RE[source])?.[1];
      (nativeId && liveIds.has(nativeId) ? live : idle).push(row.id);
    }

    if (live.length > 0) {
      await db
        .update(scrapeTarget)
        .set({ isLive: true })
        .where(inArray(scrapeTarget.id, live));
    }
    if (idle.length > 0) {
      await db
        .update(scrapeTarget)
        .set({ isLive: false })
        .where(
          and(eq(scrapeTarget.source, source), inArray(scrapeTarget.id, idle)),
        );
    }
  }

  // Publish the fresh truth to the KV idle gate (Phase D). Recomputed from the
  // authoritative D1 read so the flag reflects EVERY source, not just the last
  // loop iteration. A no-op under Node/test (no KV binding).
  await publishLiveWindowToKv();
}

/**
 * Write the current D1 live-truth + a new refresh deadline into KV. Called by
 * `refreshLiveWindow`; safe no-op when no KV binding is present.
 */
async function publishLiveWindowToKv(now = Date.now()): Promise<void> {
  const kv = pollerKv();
  if (!kv) return;
  const live = await hasLiveTargetsFromDb();
  await kv.put(KV_IS_LIVE, live ? "1" : "0");
  await kv.put(KV_NEXT_REFRESH, String(now + LIVE_WINDOW_TTL_MS));
}
