import { getScraper } from "@/lib/scrapers/registry";
import type { SourceKind } from "@/lib/scrapers/types";
import { syncTargets } from "./discover";

const SOURCES: SourceKind[] = ["mg-scoreboard", "pmglivescore"];

export interface SeedResult {
  source: SourceKind;
  count: number;
  ok: boolean;
}

/**
 * Bootstrap seeding: list every known event for a source (archive crawl / wp-json
 * enumeration) and upsert them as entry-kind `scrape_target`s. Seeded targets are
 * `is_live = false` by default; a separate live-window pass flags the events that
 * are actually running. Idempotent (syncTargets upserts on the url unique key).
 */
export async function seedSource(
  source: SourceKind,
  signal: AbortSignal,
  opts: { isLive?: boolean } = {},
): Promise<SeedResult> {
  const events = await getScraper(source).listEvents(signal);
  await syncTargets(source, events, { isLive: opts.isLive });
  return { source, count: events.length, ok: true };
}

/** Seed all sources; a failing source is reported (ok:false) but never aborts the rest. */
export async function seedAll(
  signal: AbortSignal,
  opts: { isLive?: boolean } = {},
): Promise<SeedResult[]> {
  const results: SeedResult[] = [];
  for (const source of SOURCES) {
    try {
      results.push(await seedSource(source, signal, opts));
    } catch {
      results.push({ source, count: 0, ok: false });
    }
  }
  return results;
}
