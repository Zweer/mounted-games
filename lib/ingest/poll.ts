import { createHash } from "node:crypto";
import { getScraper } from "@/lib/scrapers/registry";
import { syncTargets } from "./discover";
import { claimScheduledTask } from "./lease";
import {
  hasLiveTargets,
  isLiveWindowRefreshDue,
  refreshLiveWindow,
} from "./live-window";
import type { ScrapeTargetRow } from "./targets";
import {
  claimTarget,
  DEFAULT_ARCHIVE_POLL_INTERVAL_MS,
  DEFAULT_LIVE_POLL_INTERVAL_MS,
  markFailed,
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
  /** Maximum wall-clock budget for this invocation. */
  budgetMs?: number;
}

const DISCOVERY_INTERVAL_MS = 5 * 60_000;
const ARCHIVE_INTERVAL_MS = 15 * 60_000;

// ---------------------------------------------------------------------------
// Shared target-processing loop
// ---------------------------------------------------------------------------

async function processTargets(
  targets: ScrapeTargetRow[],
  timeoutMs: number,
  budgetMs: number,
  intervalMs: number,
): Promise<{ processed: number; errors: number }> {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  let errors = 0;

  for (const target of targets) {
    if (Date.now() >= deadline || !(await claimTarget(target.id))) break;
    const scraper = getScraper(target.source);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const html = await scraper.fetch(target.url, controller.signal);
      const contentHash = createHash("sha256").update(html).digest("hex");
      if (contentHash === target.contentHash) {
        await markScraped(target.id, contentHash, intervalMs);
        processed += 1;
        continue;
      }
      const ctx = { url: target.url, kind: target.kind };
      const scrape = scraper.parse(html, ctx);
      // The event page carries no date; use the one captured at discovery.
      if (target.startsOn && !scrape.competition.startsOn) {
        scrape.competition.startsOn = target.startsOn;
      }
      if (target.endsOn && !scrape.competition.endsOn) {
        scrape.competition.endsOn = target.endsOn;
      }
      await persistScrape(scrape);
      await markScraped(target.id, contentHash, intervalMs);
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
      await markFailed(target.id);
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
  const limit = options.limit ?? 2;
  const timeoutMs = options.timeoutMs ?? 6000;
  const budgetMs = options.budgetMs ?? 20_000;

  // Refresh the live window periodically, not on every tick. The refresh is the
  // authoritative, source-hitting, D1-writing recompute; the idle gate keeps it
  // off the quiet path. On Workers the "is it due?" question is answered from KV
  // (`poller:next-refresh`), so a not-yet-due idle tick issues ZERO D1 queries;
  // `claimScheduledTask` (a D1 write) is only consulted under Node/test, where
  // KV is absent and `isLiveWindowRefreshDue()` returns true (see live-window).
  if (
    (await isLiveWindowRefreshDue()) &&
    (await claimScheduledTask("live-discovery", DISCOVERY_INTERVAL_MS))
  ) {
    const refreshController = new AbortController();
    const refreshTimer = setTimeout(() => refreshController.abort(), timeoutMs);
    try {
      await refreshLiveWindow(refreshController.signal);
    } catch {
      // Leave existing flags; proceed with whatever is currently live.
    } finally {
      clearTimeout(refreshTimer);
    }
  }

  if (!(await hasLiveTargets())) {
    return { mode: "live", skipped: true, processed: 0, errors: 0 };
  }

  const targets = await selectStaleLiveTargets(limit);
  const { processed, errors } = await processTargets(
    targets,
    timeoutMs,
    budgetMs,
    DEFAULT_LIVE_POLL_INTERVAL_MS,
  );
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
  const timeoutMs = options.timeoutMs ?? 6000;
  const budgetMs = options.budgetMs ?? 20_000;

  const targets = await selectStaleIdleTargets(limit);
  if (targets.length === 0) {
    return { mode: "archive", skipped: true, processed: 0, errors: 0 };
  }

  const { processed, errors } = await processTargets(
    targets,
    timeoutMs,
    budgetMs,
    DEFAULT_ARCHIVE_POLL_INTERVAL_MS,
  );
  return { mode: "archive", skipped: false, processed, errors };
}

/** One dispatcher tick: live work first, archive only during an idle slot. */
export async function runDispatcherTick(
  options: PollOptions = {},
): Promise<{ live: PollSummary; archive: PollSummary | null }> {
  const live = await runPollTick(options);
  if (
    !live.skipped ||
    !(await claimScheduledTask("archive", ARCHIVE_INTERVAL_MS))
  ) {
    return { live, archive: null };
  }
  return {
    live,
    archive: await runArchiveTick({
      ...options,
      timeoutMs: Math.min(options.timeoutMs ?? 6000, 4000),
      budgetMs: Math.min(options.budgetMs ?? 20_000, 8000),
    }),
  };
}
