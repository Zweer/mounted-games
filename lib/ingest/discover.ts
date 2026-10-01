import { sql } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";
import type { DiscoveredTarget, SourceKind } from "@/lib/scrapers/types";

/**
 * Number of bound parameters one target row contributes to the INSERT: one per
 * VALUES column ({@link buildRows} sets `source, url, kind, categoryId, isLive,
 * startsOn, endsOn`). Keep in sync with that row shape.
 */
const BOUND_PARAMS_PER_ROW = 7;

/**
 * Cloudflare D1 caps a single SQL statement at 100 bound parameters ("too many
 * SQL variables" past that — https://developers.cloudflare.com/d1/platform/limits/).
 * A bulk `INSERT … VALUES (…),(…),…` binds `BOUND_PARAMS_PER_ROW` per row, so a
 * seed listing dozens/hundreds of events (the mg archive crawl, the pmg wp-json
 * enumeration) overruns the cap in ONE statement and D1 rejects the whole write.
 * Chunk the rows so each statement stays under 100 (the `ON CONFLICT … set`
 * clause binds no per-row parameters — it references `excluded.*` and the
 * table column — so the row VALUES are the only bound params that scale).
 * better-sqlite3 (dev/test) has no such cap, which is why this only bit on D1.
 */
const MAX_ROWS_PER_INSERT = Math.floor(100 / BOUND_PARAMS_PER_ROW); // 14

/**
 * Idempotently persist discovered scrape targets. Keyed on the `url` unique
 * index (`scrape_target_url_uq`): re-running discovery for the same event never
 * duplicates rows. `kind` is refreshed on conflict; `categoryId`/`isLive` are
 * updated only when explicitly provided (so a later category-link or live-flag
 * pass does not clobber values set elsewhere).
 *
 * No interactive transaction is used — Cloudflare D1 does not support them — and
 * each `INSERT … ON CONFLICT` statement is itself atomic and idempotent. The
 * rows are written in bounded chunks (see {@link MAX_ROWS_PER_INSERT}) to stay
 * within D1's 100-bound-parameter-per-statement limit; because every statement
 * is an idempotent upsert on the same unique key, splitting the write across
 * several statements is safe and re-runnable.
 */
export async function syncTargets(
  source: SourceKind,
  discovered: DiscoveredTarget[],
  opts: { categoryId?: number; isLive?: boolean } = {},
): Promise<void> {
  if (discovered.length === 0) return;

  const rows = discovered.map((t) => ({
    source,
    url: t.url,
    kind: t.kind,
    categoryId: opts.categoryId,
    isLive: opts.isLive ?? false,
    startsOn: t.startsOn ?? null,
    endsOn: t.endsOn ?? null,
  }));

  const set: Record<string, unknown> = {
    kind: sql`excluded.kind`,
    // Fill a date when discovery now has one; never overwrite a set date with null.
    startsOn: sql`coalesce(excluded.starts_on, ${scrapeTarget.startsOn})`,
    endsOn: sql`coalesce(excluded.ends_on, ${scrapeTarget.endsOn})`,
  };
  if (opts.categoryId !== undefined) set.categoryId = sql`excluded.category_id`;
  if (opts.isLive !== undefined) set.isLive = sql`excluded.is_live`;

  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + MAX_ROWS_PER_INSERT);
    await db
      .insert(scrapeTarget)
      .values(chunk)
      .onConflictDoUpdate({ target: scrapeTarget.url, set });
  }
}
