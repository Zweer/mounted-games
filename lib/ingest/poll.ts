import { getScraper } from "@/lib/scrapers/registry";
import { hasLiveTargets } from "./live-window";
import { markScraped, selectStaleLiveTargets } from "./targets";
import { persistScrape } from "./upsert";

export interface PollSummary {
  /** True when the live-window gate returned early (nothing to do). */
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

/**
 * One bounded poll tick: gate on the live window, take the few stalest live
 * targets, fetch+parse+upsert each under a per-fetch timeout, and mark them
 * scraped. A slow/failed target is skipped and retried next tick — it never
 * fails the whole invocation.
 */
export async function runPollTick(
  options: PollOptions = {},
): Promise<PollSummary> {
  const limit = options.limit ?? 3;
  const timeoutMs = options.timeoutMs ?? 9000;

  if (!(await hasLiveTargets())) {
    return { skipped: true, processed: 0, errors: 0 };
  }

  const targets = await selectStaleLiveTargets(limit);
  let processed = 0;
  let errors = 0;

  for (const target of targets) {
    const scraper = getScraper(target.source);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const html = await scraper.fetch(target.url, controller.signal);
      const scrape = scraper.parse(html, {
        url: target.url,
        kind: target.kind,
      });
      await persistScrape(scrape);
      await markScraped(target.id);
      processed += 1;
    } catch {
      // Slow/failed target: skip, retry next tick.
      errors += 1;
    } finally {
      clearTimeout(timer);
    }
  }

  return { skipped: false, processed, errors };
}
