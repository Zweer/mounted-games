import { and, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { NormalizedScrape } from "@/lib/scrapers/types";
import { createTestDb } from "@/lib/test/sqlite-harness";
import { type PersistDb, persistScrape } from "./upsert";

/** A representative pmg-style SQUADRE scrape: 2 teams, rosters with ponies. */
function buildScrape(): NormalizedScrape {
  const nation = { code: "IT", name: "Italia" };
  const phase = {
    kind: "session" as const,
    ordinal: 1,
    label: "Sessione 1",
  };
  return {
    source: "pmglivescore",
    competition: {
      name: "CAMPIONATI ITALIANI MG A SQUADRE",
      groupingKey: "campionati-italiani-mg-a-squadre",
      nation,
    },
    category: {
      format: "team",
      ageBand: "OPEN",
      pro: false,
      label: "Squadre",
      nativeId: "47000",
    },
    participants: [
      {
        type: "team",
        label: "RUSGHEDDU",
        nativeId: "sq-1",
        nation,
        members: [
          {
            familyName: "FILIGHEDDU",
            givenName: "ANDREA MARIO",
            horse: "STELLA",
          },
          { familyName: "PIRAS", givenName: "LUCA", horse: "BRIO" },
        ],
      },
      {
        type: "team",
        label: "SANTU LUSSURZU",
        nation,
        members: [
          { familyName: "SANNA", givenName: "MARCO", horse: "FULMINE" },
        ],
      },
    ],
    results: [
      {
        participantLabel: "RUSGHEDDU",
        phase,
        pointsTotal: 48.5,
        rank: 1,
        games: [
          { game: "Five Flag Race", points: 24.5, ordinal: 0 },
          { game: "Pony Express", points: 24, ordinal: 1 },
        ],
      },
      {
        participantLabel: "SANTU LUSSURZU",
        phase,
        pointsTotal: 40,
        rank: 2,
        games: [
          { game: "Five Flag Race", points: 20, ordinal: 0 },
          { game: "Pony Express", points: 20, ordinal: 1 },
        ],
      },
    ],
  };
}

describe("persistScrape — SQLite integration", () => {
  let db: PersistDb;
  let close: () => void;

  beforeEach(() => {
    ({ db, close } = createTestDb());
  });

  afterEach(() => {
    close();
  });

  const count = (table: SQLiteTable): Promise<number> =>
    db
      .select()
      .from(table)
      .then((rows) => rows.length);

  it("creates the full row graph from a scrape", async () => {
    // Arrange
    const scrape = buildScrape();
    // Act
    await persistScrape(scrape, db);
    // Assert — one row per resolved entity.
    expect(await count(schema.nation)).toBe(1);
    expect(await count(schema.competition)).toBe(1);
    expect(await count(schema.category)).toBe(1);
    expect(await count(schema.participant)).toBe(2);
    expect(await count(schema.participantMember)).toBe(3); // 2 + 1 riders
    expect(await count(schema.horse)).toBe(3);
    expect(await count(schema.athlete)).toBe(3);
    expect(await count(schema.phase)).toBe(1);
    expect(await count(schema.result)).toBe(2);
    expect(await count(schema.game)).toBe(2);
    expect(await count(schema.gameResult)).toBe(4);
  });

  it("records the category native id in source_ref", async () => {
    // Arrange / Act
    await persistScrape(buildScrape(), db);
    // Assert
    const [cat] = await db.select().from(schema.category).limit(1);
    const refs = await db
      .select()
      .from(schema.sourceRef)
      .where(
        and(
          eq(schema.sourceRef.entityType, "category"),
          eq(schema.sourceRef.nativeId, "47000"),
        ),
      );
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe("pmglivescore");
    expect(refs[0].entityId).toBe(cat.id);
  });

  it("is idempotent — running twice does not duplicate rows", async () => {
    // Arrange
    const scrape = buildScrape();
    // Act — run the same scrape twice.
    await persistScrape(scrape, db);
    await persistScrape(scrape, db);
    // Assert — counts unchanged after the second run.
    expect(await count(schema.nation)).toBe(1);
    expect(await count(schema.competition)).toBe(1);
    expect(await count(schema.category)).toBe(1);
    expect(await count(schema.participant)).toBe(2);
    expect(await count(schema.participantMember)).toBe(3);
    expect(await count(schema.result)).toBe(2);
    expect(await count(schema.game)).toBe(2);
    expect(await count(schema.gameResult)).toBe(4);
    expect(await count(schema.sourceRef)).toBe(2); // 1 category + 1 participant
  });

  it("updates a mutable score in place on re-scrape", async () => {
    // Arrange
    const first = buildScrape();
    await persistScrape(first, db);
    // Act — same keys, changed total points.
    const updated = buildScrape();
    updated.results[0].pointsTotal = 51;
    await persistScrape(updated, db);
    // Assert — value updated, no new result row.
    expect(await count(schema.result)).toBe(2);
    const [winner] = await db
      .select()
      .from(schema.participant)
      .where(eq(schema.participant.normalizedLabel, "rusgheddu"))
      .limit(1);
    const rows = await db
      .select()
      .from(schema.result)
      .where(eq(schema.result.participantId, winner.id));
    expect(rows).toHaveLength(1);
    // Stored as integer cents: 51.00 → 5100.
    expect(rows[0].pointsTotalCents).toBe(5100);
  });

  // ---------------------------------------------------------------------------
  // MONEY-AS-CENTS round-trip (A4/A8/A13)
  // ---------------------------------------------------------------------------

  it("stores decimal scores as integer cents (no float drift)", async () => {
    // Arrange / Act
    await persistScrape(buildScrape(), db);
    // Assert — 48.5 → 4850, 40 → 4000; per-game 24.5 → 2450, 24 → 2400.
    const [winner] = await db
      .select()
      .from(schema.participant)
      .where(eq(schema.participant.normalizedLabel, "rusgheddu"))
      .limit(1);
    const [row] = await db
      .select()
      .from(schema.result)
      .where(eq(schema.result.participantId, winner.id))
      .limit(1);
    expect(row.pointsTotalCents).toBe(4850);
    expect(Number.isInteger(row.pointsTotalCents)).toBe(true);

    const gameRows = await db
      .select()
      .from(schema.gameResult)
      .where(eq(schema.gameResult.resultId, row.id));
    const cents = gameRows.map((g) => g.pointsCents).sort((a, b) => a - b);
    expect(cents).toEqual([2400, 2450]);
    for (const c of cents) expect(Number.isInteger(c)).toBe(true);
  });

  it("round-trips cents back to the original decimal via the read helper", async () => {
    // The read layer's cents→number helper is the inverse of ingest's toCents.
    const { toNumber } = await import("@/lib/queries/standings");
    await persistScrape(buildScrape(), db);
    const [winner] = await db
      .select()
      .from(schema.participant)
      .where(eq(schema.participant.normalizedLabel, "rusgheddu"))
      .limit(1);
    const [row] = await db
      .select()
      .from(schema.result)
      .where(eq(schema.result.participantId, winner.id))
      .limit(1);
    expect(toNumber(row.pointsTotalCents)).toBe(48.5);
  });
});
