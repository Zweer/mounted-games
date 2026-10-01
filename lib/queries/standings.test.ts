import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { type PersistDb, persistScrape } from "@/lib/ingest/upsert";
import type { NormalizedScrape } from "@/lib/scrapers/types";
import { createTestDb } from "@/lib/test/sqlite-harness";
import { getCategoryStandings } from "./standings";

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

/** A tie scenario: two teams share pointsTotal and rank, both flagged isTie. */
function buildTieScrape(): NormalizedScrape {
  const nation = { code: "IT", name: "Italia" };
  const phase = { kind: "session" as const, ordinal: 1, label: "Sessione 1" };
  return {
    source: "pmglivescore",
    competition: {
      name: "TROFEO PAREGGIO",
      groupingKey: "trofeo-pareggio",
      nation,
    },
    category: {
      format: "team",
      ageBand: "OPEN",
      pro: false,
      label: "Squadre",
      nativeId: "49000",
    },
    participants: [
      { type: "team", label: "ALPHA", nativeId: "a", nation, members: [] },
      { type: "team", label: "BETA", nativeId: "b", nation, members: [] },
    ],
    results: [
      {
        participantLabel: "ALPHA",
        phase,
        pointsTotal: 42.25,
        rank: 1,
        isTie: true,
        games: [],
      },
      {
        participantLabel: "BETA",
        phase,
        pointsTotal: 42.25,
        rank: 1,
        isTie: true,
        games: [],
      },
    ],
  };
}

async function seededCategoryId(db: PersistDb): Promise<number> {
  const [cat] = await db.select().from(schema.category).limit(1);
  return cat.id;
}

describe("getCategoryStandings — SQLite integration", () => {
  let db: PersistDb;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = createTestDb());
    await persistScrape(buildScrape(), db);
  });

  afterEach(() => {
    close();
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
    expect(top.pointsTotal).toBe(48.5); // cents → number (4850 / 100)
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

  it("preserves decimal precision through cents (24.5 games sum to 48.5)", async () => {
    // Integer-cents storage keeps the sum exact — no float drift.
    const categoryId = await seededCategoryId(db);
    const payload = await getCategoryStandings(categoryId, undefined, db);
    const top = payload?.standings[0];
    const gameSum = (top?.games ?? []).reduce((s, g) => s + g.points, 0);
    expect(gameSum).toBe(48.5);
    expect(top?.pointsTotal).toBe(gameSum);
  });

  it("orders tied participants by rank then keeps both isTie flags", async () => {
    // Fresh DB with a two-way tie at rank 1.
    close();
    ({ db, close } = createTestDb());
    await persistScrape(buildTieScrape(), db);
    const categoryId = await seededCategoryId(db);
    const payload = await getCategoryStandings(categoryId, undefined, db);
    expect(payload).not.toBeNull();
    if (!payload) return;
    expect(payload.standings).toHaveLength(2);
    // Both share rank 1 and the isTie flag; equal integer cents → deterministic.
    for (const row of payload.standings) {
      expect(row.rank).toBe(1);
      expect(row.isTie).toBe(true);
      expect(row.pointsTotal).toBe(42.25);
    }
  });
});
