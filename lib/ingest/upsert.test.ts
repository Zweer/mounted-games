import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { NormalizedScrape } from "@/lib/scrapers/types";
import { type PersistDb, persistScrape } from "./upsert";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "db");

/**
 * Apply the generated drizzle migrations to a fresh database by executing the
 * raw SQL. Files are split on drizzle's `--> statement-breakpoint` marker and
 * run in filename order (0000 auth → 0001 domain).
 */
async function applySchema(client: PGlite): Promise<void> {
  const files = ["0000_clever_sage.sql", "0001_shocking_marvel_apes.sql"];
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      await client.exec(statement);
    }
  }
}

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

describe("persistScrape — pglite integration", () => {
  let client: PGlite;
  let db: PersistDb;

  beforeEach(async () => {
    client = new PGlite();
    await applySchema(client);
    db = drizzle(client, { schema }) as unknown as PersistDb;
  });

  afterEach(async () => {
    await client.close();
  });

  const count = (table: PgTable): Promise<number> =>
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
    expect(Number(rows[0].pointsTotal)).toBe(51);
  });
});
