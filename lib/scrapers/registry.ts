import { mgScoreboardScraper } from "./mg-scoreboard";
import { pmgLivescoreScraper } from "./pmglivescore";
import type { Scraper, SourceKind } from "./types";

const SCRAPERS: Record<SourceKind, Scraper> = {
  "mg-scoreboard": mgScoreboardScraper,
  pmglivescore: pmgLivescoreScraper,
};

/** Resolve the scraper for a source. */
export function getScraper(source: SourceKind): Scraper {
  return SCRAPERS[source];
}
