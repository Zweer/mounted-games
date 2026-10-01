import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { getSecret } from "@/lib/runtime/workers-env";

// Destructive maintenance route — never statically optimized.
export const dynamic = "force-dynamic";

/**
 * Scraped domain tables, listed CHILD-FIRST so per-table DELETEs respect the
 * foreign keys (SQLite/D1 has no `TRUNCATE ... CASCADE`). Reference tables
 * (`nation`, `venue`) and the auth tables are intentionally preserved — only
 * reproducible scraped data is wiped. After the deletes we clear
 * `sqlite_sequence` for these tables so a fresh re-seed restarts ids at 1
 * (the SQLite equivalent of Postgres `RESTART IDENTITY`).
 */
const SCRAPED_TABLES = [
  // children → parents
  "game_result",
  "result",
  "participant_member",
  "participant",
  "source_ref",
  "scrape_target",
  "heat",
  "phase",
  "category",
  "competition",
  "athlete",
  "horse",
  "team",
  "game_alias",
  "game",
] as const;

/**
 * `POST /api/admin/reset?confirm=1` — wipe all scraped data so the next
 * `/api/seed` + poll re-ingests it with corrected grouping / dates / level.
 *
 * DESTRUCTIVE and double-gated: requires the `CRON_SECRET` bearer AND an
 * explicit `?confirm=1`. Scraped data is reproducible from the sources; auth and
 * reference data (nations/venues) are preserved. This is the backfill mechanism
 * for spec 04 (a corrected grouping key changes competition identity, so a clean
 * reset avoids leaving mis-grouped duplicates behind).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = getSecret("CRON_SECRET");
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "1") {
    return NextResponse.json(
      {
        error: "confirmation required",
        hint: "This wipes ALL scraped data. Re-send with ?confirm=1 to proceed.",
        tables: SCRAPED_TABLES,
      },
      { status: 400 },
    );
  }

  // SQLite/D1: delete each table child-first (FK-safe), then reset the
  // autoincrement counters so a fresh re-seed restarts ids at 1.
  for (const table of SCRAPED_TABLES) {
    await db.run(sql.raw(`DELETE FROM "${table}"`));
  }
  const seqList = SCRAPED_TABLES.map((t) => `'${t}'`).join(", ");
  await db.run(
    sql.raw(`DELETE FROM sqlite_sequence WHERE name IN (${seqList})`),
  );

  return NextResponse.json({ reset: true, tables: SCRAPED_TABLES });
}
