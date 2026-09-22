import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";

export type ScrapeTargetRow = typeof scrapeTarget.$inferSelect;

export const DEFAULT_LIVE_POLL_INTERVAL_MS = 60_000;
export const DEFAULT_ARCHIVE_POLL_INTERVAL_MS = 30 * 60_000;
export const TARGET_LEASE_MS = 45_000;

/**
 * Bounded work per tick: pick the N stalest live targets (never-scraped first).
 * Keeps each poll invocation short and well under the function-duration limit.
 */
export async function selectStaleLiveTargets(
  limit: number,
  now = new Date(),
): Promise<ScrapeTargetRow[]> {
  return db
    .select()
    .from(scrapeTarget)
    .where(
      and(
        eq(scrapeTarget.isLive, true),
        or(isNull(scrapeTarget.nextPollAt), lte(scrapeTarget.nextPollAt, now)),
        or(
          isNull(scrapeTarget.leasedUntil),
          lte(scrapeTarget.leasedUntil, now),
        ),
      ),
    )
    .orderBy(sql`${scrapeTarget.nextPollAt} asc nulls first`)
    .limit(limit);
}

/**
 * Bounded work per tick (archive mode): pick the N stalest IDLE targets
 * (never-scraped first). Used by the archive cron to incrementally backfill
 * historical data without overwhelming the sources.
 */
export async function selectStaleIdleTargets(
  limit: number,
  now = new Date(),
): Promise<ScrapeTargetRow[]> {
  return db
    .select()
    .from(scrapeTarget)
    .where(
      and(
        eq(scrapeTarget.isLive, false),
        or(isNull(scrapeTarget.nextPollAt), lte(scrapeTarget.nextPollAt, now)),
        or(
          isNull(scrapeTarget.leasedUntil),
          lte(scrapeTarget.leasedUntil, now),
        ),
      ),
    )
    .orderBy(sql`${scrapeTarget.nextPollAt} asc nulls first`)
    .limit(limit);
}

/** Claim a target for this short-lived dispatcher invocation. */
export async function claimTarget(
  targetId: number,
  leaseMs = TARGET_LEASE_MS,
): Promise<boolean> {
  const now = new Date();
  const leasedUntil = new Date(now.getTime() + leaseMs);
  const rows = await db
    .update(scrapeTarget)
    .set({ leasedUntil, lastAttemptAt: now })
    .where(
      and(
        eq(scrapeTarget.id, targetId),
        or(
          isNull(scrapeTarget.leasedUntil),
          lte(scrapeTarget.leasedUntil, now),
        ),
      ),
    )
    .returning({ id: scrapeTarget.id });
  return rows.length > 0;
}

/** Mark a target successful and schedule its next check. */
export async function markScraped(
  targetId: number,
  contentHash: string,
  intervalMs: number,
): Promise<void> {
  const now = new Date();
  await db
    .update(scrapeTarget)
    .set({
      lastScrapedAt: now,
      lastSuccessAt: now,
      nextPollAt: new Date(now.getTime() + intervalMs),
      leasedUntil: null,
      failureCount: 0,
      contentHash,
    })
    .where(eq(scrapeTarget.id, targetId));
}

/** Release a failed target with exponential backoff, capped at 15 minutes. */
export async function markFailed(targetId: number): Promise<void> {
  await db
    .update(scrapeTarget)
    .set({
      leasedUntil: null,
      nextPollAt: sql`now() + least(
        interval '15 minutes',
        interval '2 minutes' * power(2, least(${scrapeTarget.failureCount}, 3))
      )`,
      failureCount: sql`${scrapeTarget.failureCount} + 1`,
    })
    .where(eq(scrapeTarget.id, targetId));
}
