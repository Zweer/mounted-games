import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

// Destructive maintenance route — never statically optimized.
export const dynamic = "force-dynamic";

/**
 * Scraped domain tables, in a single TRUNCATE. `RESTART IDENTITY` resets the
 * serial ids (so a fresh re-seed starts clean) and `CASCADE` clears dependents.
 * Reference tables (`nation`, `venue`) and the auth tables are intentionally
 * preserved — only reproducible scraped data is wiped.
 */
const SCRAPED_TABLES = [
  "competition",
  "category",
  "phase",
  "heat",
  "participant",
  "participant_member",
  "result",
  "game_result",
  "source_ref",
  "scrape_target",
  "athlete",
  "horse",
  "team",
  "game",
  "game_alias",
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
  const secret = process.env.CRON_SECRET;
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

  const list = SCRAPED_TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));

  return NextResponse.json({ reset: true, tables: SCRAPED_TABLES });
}
