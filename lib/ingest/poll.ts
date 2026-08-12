import { getScraper } from "@/lib/scrapers/registry";
import { syncTargets } from "./discover";
import { hasLiveTargets, refreshLiveWindow } from "./live-window";
import type { ScrapeTargetRow } from "./targets";
import {
  markScraped,
  selectStaleIdleTargets,
  selectStaleLiveTargets,
} from "./targets";
import { persistScrape } from "./upsert";

export type PollMode = "live" | "archive";

export interface PollSummary {
  mode: PollMode;
  /** True when the gate returned early (nothing to do). */
  skipped: boolean;
  processed: number;
  errors: number;
}

export interface PollOptions {
  /** Max targets per tick (bounded work). */
  limit?: number;
  /** Per-fetch timeout in ms (AbortSignal). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Shared target-processing loop
// ---------------------------------------------------------------------------

async function processTargets(
  targets: ScrapeTargetRow[],
  timeoutMs: number,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (const target of targets) {
    const scraper = getScraper(target.source);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const html = await scraper.fetch(target.url, controller.signal);
      const ctx = { url: target.url, kind: target.kind };
      const scrape = scraper.parse(html, ctx);
      await persistScrape(scrape);
      await markScraped(target.id);
      // Parsing an entry page also seeds its sub-phase targets, inheriting the
      // event's live flag so the whole event is polled while it runs.
      if (target.kind === scraper.entryKind) {
        await syncTargets(target.source, scraper.discoverTargets(html, ctx), {
          isLive: target.isLive,
        });
      }
      processed += 1;
    } catch {
      // Slow/failed target: skip, retry next tick.
      errors += 1;
    } finally {
      clearTimeout(timer);
    }
  }

  return { processed, errors };
}

// ---------------------------------------------------------------------------
// Live poll tick
// ---------------------------------------------------------------------------

/**
 * One bounded live-poll tick: refresh the live window, take the few stalest live
 * targets, fetch+parse+upsert each under a per-fetch timeout, and mark them
 * scraped. A slow/failed target is skipped and retried next tick.
 */
export async function runPollTick(
  options: PollOptions = {},
): Promise<PollSummary> {
  const limit = options.limit ?? 3;
  const timeoutMs = options.timeoutMs ?? 9000;

  // Refresh the live window from the sources' own "in-progress" lists first, so
  // events auto-open/close with no manual flag. A failure here is non-fatal.
  const refreshController = new AbortController();
  const refreshTimer = setTimeout(() => refreshController.abort(), timeoutMs);
  try {
    await refreshLiveWindow(refreshController.signal);
  } catch {
    // Leave existing flags; proceed with whatever is currently live.
  } finally {
    clearTimeout(refreshTimer);
  }

  if (!(await hasLiveTargets())) {
    return { mode: "live", skipped: true, processed: 0, errors: 0 };
  }

  const targets = await selectStaleLiveTargets(limit);
  const { processed, errors } = await processTargets(targets, timeoutMs);
  return { mode: "live", skipped: false, processed, errors };
}

// ---------------------------------------------------------------------------
// Archive poll tick
// ---------------------------------------------------------------------------

/**
 * One bounded archive tick: take the single stalest IDLE (non-live) target,
 * fetch+parse+upsert it. No live-window refresh (that's the live cron's job).
 * Returns `skipped: true` when no idle targets remain (archive fully up to date).
 */
export async function runArchiveTick(
  options: PollOptions = {},
): Promise<PollSummary> {
  const limit = options.limit ?? 1;
  const timeoutMs = options.timeoutMs ?? 15000;

  const targets = await selectStaleIdleTargets(limit);
  if (targets.length === 0) {
    return { mode: "archive", skipped: true, processed: 0, errors: 0 };
  }

  const { processed, errors } = await processTargets(targets, timeoutMs);
  return { mode: "archive", skipped: false, processed, errors };
}
