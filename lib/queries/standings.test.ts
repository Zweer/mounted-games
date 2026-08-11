import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { type PersistDb, persistScrape } from "@/lib/ingest/upsert";
import type { NormalizedScrape } from "@/lib/scrapers/types";
import { getCategoryStandings } from "./standings";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "db");

/**
 * Apply the generated drizzle migrations to a fresh database by executing the
 * raw SQL. Split on drizzle's `--> statement-breakpoint` marker, run in filename
 * order (0000 auth → 0001 domain → 0002 scrape_target url unique).
 */
async function applySchema(client: PGlite): Promise<void> {
  const files = [
    "0000_clever_sage.sql",
    "0001_shocking_marvel_apes.sql",
    "0002_young_natasha_romanoff.sql",
  ];
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

/** A pmg-style SQUADRE scrape: 2 teams, one session, ranked with a game split. */
function buildScrape(): NormalizedScrape {
  const nation = { code: "IT", name: "Italia" };
  const phase = { kind: "session" as const, ordinal: 1, label: "Sessione 1" };
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
        members: [{ familyName: "PIRAS", givenName: "LUCA", horse: "BRIO" }],
      },
      {
        type: "team",
        label: "SANTU LUSSURZU",
        nativeId: "sq-2",
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

async function seededCategoryId(db: PersistDb): Promise<number> {
  const [cat] = await db.select().from(schema.category).limit(1);
  return cat.id;
}

describe("getCategoryStandings — pglite integration", () => {
  let client: PGlite;
  let db: PersistDb;

  beforeEach(async () => {
    client = new PGlite();
    await applySchema(client);
    db = drizzle(client, { schema }) as unknown as PersistDb;
    await persistScrape(buildScrape(), db);
  });

  afterEach(async () => {
    await client.close();
  });

  it("returns the ranked standings with games, phase and payload shape", async () => {
    // Arrange
    const categoryId = await seededCategoryId(db);
    // Act
    const payload = await getCategoryStandings(categoryId, undefined, db);
    // Assert — payload + category metadata
    expect(payload).not.toBeNull();
    if (!payload) return;
    expect(payload.category).toMatchObject({
      id: categoryId,
      competitionName: "CAMPIONATI ITALIANI MG A SQUADRE",
      label: "Squadre",
      format: "team",
      ageBand: "OPEN",
      pro: false,
    });
    // Phases + active phase
    expect(payload.phases).toHaveLength(1);
    expect(payload.phases[0]).toMatchObject({
      kind: "session",
      ordinal: 1,
      label: "Sessione 1",
    });
    expect(payload.activePhaseId).toBe(payload.phases[0].id);
    // Standings ordered by rank
    expect(payload.standings).toHaveLength(2);
    expect(payload.standings.map((r) => r.label)).toEqual([
      "RUSGHEDDU",
      "SANTU LUSSURZU",
    ]);
    const [top] = payload.standings;
    expect(top.rank).toBe(1);
    expect(top.pointsTotal).toBe(48.5); // numeric cast to number
    expect(top.nation).toEqual({ code: "IT", name: "Italia" });
    expect(top.games).toEqual([
      { name: "Five Flag Race", points: 24.5 },
      { name: "Pony Express", points: 24 },
    ]);
    // Freshness / live-window: no scrape_target seeded → not live
    expect(payload.isLive).toBe(false);
    expect(typeof payload.updatedAt).toBe("string");
  });

  it("honors an explicit phaseId override", async () => {
    // Arrange
    const categoryId = await seededCategoryId(db);
    const [ph] = await db.select().from(schema.phase).limit(1);
    // Act
    const payload = await getCategoryStandings(
      categoryId,
      { phaseId: ph.id },
      db,
    );
    // Assert
    expect(payload?.activePhaseId).toBe(ph.id);
    expect(payload?.standings).toHaveLength(2);
  });

  it("reports isLive when a scrape_target for the competition is live", async () => {
    // Arrange
    const categoryId = await seededCategoryId(db);
    await db.insert(schema.scrapeTarget).values({
      source: "pmglivescore",
      url: "https://pmglivescore.altervista.org/live/47000",
      kind: "iscritti",
      categoryId,
      isLive: true,
      lastScrapedAt: new Date("2026-08-11T13:00:00Z"),
    });
    // Act
    const payload = await getCategoryStandings(categoryId, undefined, db);
    // Assert
    expect(payload?.isLive).toBe(true);
    expect(payload?.updatedAt).toBe("2026-08-11T13:00:00.000Z");
  });

  it("returns null for a category that does not exist", async () => {
    // Act
    const payload = await getCategoryStandings(999_999, undefined, db);
    // Assert
    expect(payload).toBeNull();
  });
});
