import type { NormalizedScrape } from "@/lib/scrapers/types";

/**
 * Persist a normalized scrape idempotently. Resolution order (all keyed to allow
 * re-running a tick with no duplicates):
 *   1. nation (by code) → competition (by source + grouping_key) → category
 *      (by competition + format + age_band + pro + division), recording the
 *      per-source native id in `source_ref`.
 *   2. phase (by category + kind + ordinal) → heat (by phase + number).
 *   3. participant (by category + normalized_label) + team/athlete/horse
 *      identities (by normalized name), then participant_member rows
 *      (provenance = 'scraped'; never clobber 'crowdsourced'/'merged' rows).
 *   4. result (by participant + phase + heat) + game_result (by result + game),
 *      resolving game via game_alias (by source + normalized name).
 *
 * TODO(01-ingestion): implement the transaction once a concrete scraper emits
 * real NormalizedScrape data (the two parsers are being built in parallel). The
 * guard below keeps the contract honest until then.
 */
export async function persistScrape(scrape: NormalizedScrape): Promise<void> {
  if (!scrape.category.nativeId) {
    throw new Error(
      "persistScrape: scrape.category.nativeId is required for source_ref keying",
    );
  }
  // Intentionally not yet persisting — see TODO above.
}
