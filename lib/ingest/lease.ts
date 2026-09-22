import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { ingestionState } from "@/db/schema";

const JOB = "poll";
const LEASE_MS = 25_000;

/** Acquire the singleton dispatcher lease without relying on process memory. */
export async function acquirePollLease(): Promise<boolean> {
  await db
    .insert(ingestionState)
    .values({ job: JOB })
    .onConflictDoNothing({ target: ingestionState.job });

  const now = new Date();
  const leasedUntil = new Date(now.getTime() + LEASE_MS);
  const rows = await db
    .update(ingestionState)
    .set({ leaseUntil: leasedUntil })
    .where(and(eq(ingestionState.job, JOB), orLeaseExpired(now)))
    .returning({ job: ingestionState.job });
  return rows.length > 0;
}

/** Release only this job's lease; a later invocation can run immediately. */
export async function releasePollLease(): Promise<void> {
  await db
    .update(ingestionState)
    .set({ leaseUntil: null })
    .where(eq(ingestionState.job, JOB));
}

/** Claim a scheduled maintenance task when its persisted due time has elapsed. */
export async function claimScheduledTask(
  job: string,
  intervalMs: number,
): Promise<boolean> {
  await db
    .insert(ingestionState)
    .values({ job })
    .onConflictDoNothing({ target: ingestionState.job });

  const now = new Date();
  const nextRun = new Date(now.getTime() + intervalMs);
  const rows = await db
    .update(ingestionState)
    .set({
      nextRunAt: nextRun,
    })
    .where(
      and(
        eq(ingestionState.job, job),
        or(
          isNull(ingestionState.nextRunAt),
          lte(ingestionState.nextRunAt, now),
        ),
      ),
    )
    .returning({ job: ingestionState.job });
  return rows.length > 0;
}

function orLeaseExpired(now: Date) {
  return or(
    isNull(ingestionState.leaseUntil),
    lte(ingestionState.leaseUntil, now),
  );
}
