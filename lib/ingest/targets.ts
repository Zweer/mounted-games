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
  return (
    db
      .select()
      .from(scrapeTarget)
      .where(
        and(
          eq(scrapeTarget.isLive, true),
          or(
            isNull(scrapeTarget.nextPollAt),
            lte(scrapeTarget.nextPollAt, now),
          ),
          or(
            isNull(scrapeTarget.leasedUntil),
            lte(scrapeTarget.leasedUntil, now),
          ),
        ),
      )
      // SQLite sorts NULLs first under ASC by default — matching the intended
      // "never-scraped (null next_poll) first" ordering without a NULLS clause.
      .orderBy(sql`${scrapeTarget.nextPollAt} asc`)
      .limit(limit)
  );
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
    .orderBy(sql`${scrapeTarget.nextPollAt} asc`)
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
  const [row] = await db
    .select({ failureCount: scrapeTarget.failureCount })
    .from(scrapeTarget)
    .where(eq(scrapeTarget.id, targetId))
    .limit(1);
  const failureCount = row?.failureCount ?? 0;
  // 2 min * 2^min(failureCount, 3), capped at 15 min. Computed in JS so the
  // backoff is dialect-agnostic (SQLite has no `now() + interval` arithmetic).
  const backoffMs = Math.min(
    15 * 60_000,
    2 * 60_000 * 2 ** Math.min(failureCount, 3),
  );
  const nextPollAt = new Date(Date.now() + backoffMs);
  await db
    .update(scrapeTarget)
    .set({
      leasedUntil: null,
      nextPollAt,
      failureCount: failureCount + 1,
    })
    .where(eq(scrapeTarget.id, targetId));
}
