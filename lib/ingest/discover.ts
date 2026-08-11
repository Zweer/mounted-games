import { sql } from "drizzle-orm";
import { db } from "@/db";
import { scrapeTarget } from "@/db/schema";
import type { DiscoveredTarget, SourceKind } from "@/lib/scrapers/types";

/**
 * Idempotently persist discovered scrape targets. Keyed on the `url` unique
 * index (`scrape_target_url_uq`): re-running discovery for the same event never
 * duplicates rows. `kind` is refreshed on conflict; `categoryId`/`isLive` are
 * updated only when explicitly provided (so a later category-link or live-flag
 * pass does not clobber values set elsewhere).
 *
 * No interactive transaction is used — neon-http does not support them — the
 * single `INSERT … ON CONFLICT` statement is itself atomic and idempotent.
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
  }));

  const set: Record<string, unknown> = { kind: sql`excluded.kind` };
  if (opts.categoryId !== undefined) set.categoryId = sql`excluded.category_id`;
  if (opts.isLive !== undefined) set.isLive = sql`excluded.is_live`;

  await db
    .insert(scrapeTarget)
    .values(rows)
    .onConflictDoUpdate({ target: scrapeTarget.url, set });
}
