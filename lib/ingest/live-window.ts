import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";
import { getScraper } from "@/lib/scrapers/registry";
import type { SourceKind } from "@/lib/scrapers/types";
import { syncTargets } from "./discover";

const SOURCES: SourceKind[] = ["mg-scoreboard", "pmglivescore"];

/** Per-source regex that extracts the native event id from a target url. */
const NATIVE_ID_RE: Record<SourceKind, RegExp> = {
  "mg-scoreboard": /[?&]id=(\d+)/,
  pmglivescore: /[?&]post_id=(\d+)/,
};

/**
 * Live-window gate: is there anything live to scrape right now? Outside a live
 * window the poller returns immediately, so a frequent external ping costs
 * almost nothing off-season and stays polite to the sources.
 */
export async function hasLiveTargets(): Promise<boolean> {
  const rows = await db
    .select({ id: scrapeTarget.id })
    .from(scrapeTarget)
    .where(eq(scrapeTarget.isLive, true))
    .limit(1);
  return rows.length > 0;
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
}
