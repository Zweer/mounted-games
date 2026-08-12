import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";

export type ScrapeTargetRow = typeof scrapeTarget.$inferSelect;

/**
 * Bounded work per tick: pick the N stalest live targets (never-scraped first).
 * Keeps each poll invocation short and well under the function-duration limit.
 */
export async function selectStaleLiveTargets(
  limit: number,
): Promise<ScrapeTargetRow[]> {
  return db
    .select()
    .from(scrapeTarget)
    .where(eq(scrapeTarget.isLive, true))
    .orderBy(sql`${scrapeTarget.lastScrapedAt} asc nulls first`)
    .limit(limit);
}

/**
 * Bounded work per tick (archive mode): pick the N stalest IDLE targets
 * (never-scraped first). Used by the archive cron to incrementally backfill
 * historical data without overwhelming the sources.
 */
export async function selectStaleIdleTargets(
  limit: number,
): Promise<ScrapeTargetRow[]> {
  return db
    .select()
    .from(scrapeTarget)
    .where(eq(scrapeTarget.isLive, false))
    .orderBy(sql`${scrapeTarget.lastScrapedAt} asc nulls first`)
    .limit(limit);
}

/** Mark a target as scraped now, so the next tick moves on to the next stalest. */
export async function markScraped(targetId: number): Promise<void> {
  await db
    .update(scrapeTarget)
    .set({ lastScrapedAt: new Date() })
    .where(eq(scrapeTarget.id, targetId));
}
