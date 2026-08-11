import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";

/**
 * Live-window gate: is there anything live to scrape right now? Outside a live
 * window the poller returns immediately, so a frequent external ping costs
 * almost nothing off-season and stays polite to the sources.
 *
 * v1 signal = any `scrape_target` flagged `is_live`. A scheduler/admin flow flips
 * targets live/idle around competition windows (later milestone).
 */
export async function hasLiveTargets(): Promise<boolean> {
  const rows = await db
    .select({ id: scrapeTarget.id })
    .from(scrapeTarget)
    .where(eq(scrapeTarget.isLive, true))
    .limit(1);
  return rows.length > 0;
}
