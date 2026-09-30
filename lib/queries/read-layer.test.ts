import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { type PersistDb, persistScrape } from "@/lib/ingest/upsert";
import type { NormalizedScrape } from "@/lib/scrapers/types";
import { createTestDb } from "@/lib/test/sqlite-harness";
import { getCompetition, listCompetitions } from "./competitions";
import { getAthlete, getHorse, getNation, getTeam } from "./entities";
import { getLiveCategories, getRecentResults } from "./home";
import { search } from "./search";

/** A pmg-style individual scrape with riders + horses for rich entity testing. */
function buildIndividualScrape(): NormalizedScrape {
  const nation = { code: "IT", name: "Italia" };
  const phase = { kind: "session" as const, ordinal: 1, label: "Sessione 1" };
  return {
    source: "pmglivescore",
    competition: {
      name: "TROFEO INDIVIDUALE PMG",
      groupingKey: "trofeo-individuale-pmg",
      nation,
    },
    category: {
      format: "individual",
      ageBand: "U15",
      pro: false,
      label: "Individuali U15",
      nativeId: "48000",
    },
    participants: [
      {
        type: "individual",
        label: "ROSSI MARIA",
        nativeId: "ind-1",
        nation,
        members: [
          { familyName: "ROSSI", givenName: "MARIA", horse: "STELLINA" },
        ],
      },
      {
        type: "individual",
        label: "BIANCHI LUCA",
        nativeId: "ind-2",
        nation,
        members: [
          { familyName: "BIANCHI", givenName: "LUCA", horse: "FULMINE" },
        ],
      },
    ],
    results: [
      {
        participantLabel: "ROSSI MARIA",
        phase,
        pointsTotal: 52,
        rank: 1,
        games: [
          { game: "Speed Weavers", points: 26, ordinal: 0 },
          { game: "Pony Express", points: 26, ordinal: 1 },
        ],
      },
      {
        participantLabel: "BIANCHI LUCA",
        phase,
        pointsTotal: 44,
        rank: 2,
        games: [
          { game: "Speed Weavers", points: 22, ordinal: 0 },
          { game: "Pony Express", points: 22, ordinal: 1 },
        ],
      },
    ],
  };
}

/** A team scrape for listCompetitions / getCompetition. */
function buildTeamScrape(): NormalizedScrape {
  const nation = { code: "IT", name: "Italia" };
  const phase = { kind: "final" as const, ordinal: 1, label: "Finale A" };
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

describe("Read layer — SQLite integration", () => {
  let db: PersistDb;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = createTestDb());
    // Seed both scrapes for a rich test graph.
    await persistScrape(buildTeamScrape(), db);
    await persistScrape(buildIndividualScrape(), db);
  });

  afterEach(() => {
    close();
  });

  // -------------------------------------------------------------------------
  // competitions.ts
  // -------------------------------------------------------------------------

  describe("listCompetitions", () => {
    it("returns all competitions ordered by date desc with category count", async () => {
      const list = await listCompetitions(undefined, db);
      expect(list.length).toBeGreaterThanOrEqual(2);
      // Both seeded competitions should be present.
      const names = list.map((c) => c.name);
      expect(names).toContain("CAMPIONATI ITALIANI MG A SQUADRE");
      expect(names).toContain("TROFEO INDIVIDUALE PMG");
      // Each has at least 1 category.
      for (const row of list) {
        expect(row.categoryCount).toBeGreaterThanOrEqual(1);
      }
    });

    it("filters by format", async () => {
      const list = await listCompetitions({ format: "individual" }, db);
      expect(list.every((c) => c.name === "TROFEO INDIVIDUALE PMG")).toBe(true);
    });
  });

  describe("getCompetition", () => {
    it("returns competition detail with categories and phases", async () => {
      const [comp] = await db
        .select({ id: schema.competition.id })
        .from(schema.competition)
        .limit(1);
      const detail = await getCompetition(comp.id, db);
      expect(detail).not.toBeNull();
      if (!detail) return;
      expect(detail.name).toBeTruthy();
      expect(detail.categories.length).toBeGreaterThanOrEqual(1);
      // Each category has phases.
      for (const cat of detail.categories) {
        expect(cat.phases.length).toBeGreaterThanOrEqual(1);
        expect(cat.phases[0]).toHaveProperty("kind");
        expect(cat.phases[0]).toHaveProperty("ordinal");
        expect(cat.phases[0]).toHaveProperty("label");
      }
    });

    it("returns null for a non-existent competition", async () => {
      const result = await getCompetition(999_999, db);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // entities.ts
  // -------------------------------------------------------------------------

  describe("getAthlete", () => {
    it("returns athlete profile with participation history and stats", async () => {
      const [ath] = await db.select().from(schema.athlete).limit(1);
      const profile = await getAthlete(ath.id, db);
      expect(profile).not.toBeNull();
      if (!profile) return;
      expect(profile.familyName).toBeTruthy();
      expect(profile.headlineStats.appearances).toBeGreaterThanOrEqual(1);
      expect(profile.participationHistory.length).toBeGreaterThanOrEqual(1);
      const entry = profile.participationHistory[0];
      expect(entry).toHaveProperty("competitionName");
      expect(entry).toHaveProperty("categoryLabel");
      expect(entry).toHaveProperty("rank");
      expect(entry).toHaveProperty("points");
    });

    it("returns null for a non-existent athlete", async () => {
      const result = await getAthlete(999_999, db);
      expect(result).toBeNull();
    });
  });

  describe("getHorse", () => {
    it("returns horse profile with participation history", async () => {
      const [h] = await db.select().from(schema.horse).limit(1);
      const profile = await getHorse(h.id, db);
      expect(profile).not.toBeNull();
      if (!profile) return;
      expect(profile.name).toBeTruthy();
      expect(profile.headlineStats.appearances).toBeGreaterThanOrEqual(1);
      expect(profile.participationHistory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getTeam", () => {
    it("returns team profile with participation history", async () => {
      const [t] = await db.select().from(schema.team).limit(1);
      const profile = await getTeam(t.id, db);
      expect(profile).not.toBeNull();
      if (!profile) return;
      expect(profile.name).toBeTruthy();
      expect(profile.headlineStats.appearances).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getNation", () => {
    it("returns nation profile with participation history", async () => {
      const profile = await getNation("IT", db);
      expect(profile).not.toBeNull();
      if (!profile) return;
      expect(profile.code).toBe("IT");
      expect(profile.name).toBe("Italia");
      expect(profile.headlineStats.appearances).toBeGreaterThanOrEqual(1);
      expect(profile.participationHistory.length).toBeGreaterThanOrEqual(1);
    });

    it("returns null for a non-existent nation code", async () => {
      const result = await getNation("ZZ", db);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // search.ts
  // -------------------------------------------------------------------------

  describe("search", () => {
    it("finds athletes by normalized name", async () => {
      const results = await search("rossi", db);
      expect(results.athletes.length).toBeGreaterThanOrEqual(1);
      expect(
        results.athletes.some((a) => a.label.toLowerCase().includes("rossi")),
      ).toBe(true);
    });

    it("finds horses by normalized name", async () => {
      const results = await search("stellina", db);
      expect(results.horses.length).toBeGreaterThanOrEqual(1);
    });

    it("finds teams by normalized name", async () => {
      const results = await search("rusgheddu", db);
      expect(results.teams.length).toBeGreaterThanOrEqual(1);
    });

    it("finds competitions by normalized name", async () => {
      const results = await search("trofeo", db);
      expect(results.competitions.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty results for empty term", async () => {
      const results = await search("", db);
      expect(results.athletes).toHaveLength(0);
      expect(results.horses).toHaveLength(0);
      expect(results.teams).toHaveLength(0);
      expect(results.competitions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // home.ts
  // -------------------------------------------------------------------------

  describe("getLiveCategories", () => {
    it("returns empty when no scrape_target is live", async () => {
      const live = await getLiveCategories(db);
      expect(live).toHaveLength(0);
    });

    it("returns live categories when a scrape_target is live", async () => {
      // Make one category live.
      const [cat] = await db.select().from(schema.category).limit(1);
      await db.insert(schema.scrapeTarget).values({
        source: "pmglivescore",
        url: "https://pmglivescore.altervista.org/live/47000",
        kind: "iscritti",
        categoryId: cat.id,
        isLive: true,
        lastScrapedAt: new Date(),
      });
      const live = await getLiveCategories(db);
      expect(live.length).toBeGreaterThanOrEqual(1);
      const found = live.find((l) => l.categoryId === cat.id);
      expect(found).toBeDefined();
      expect(found?.leaderLabel).toBeTruthy();
    });
  });

  describe("getRecentResults", () => {
    it("returns recently concluded categories with winner", async () => {
      // Without any live targets, all seeded categories are 'concluded'.
      const results = await getRecentResults(10, db);
      expect(results.length).toBeGreaterThanOrEqual(1);
      const first = results[0];
      expect(first).toHaveProperty("competitionName");
      expect(first).toHaveProperty("categoryLabel");
      expect(first).toHaveProperty("winnerLabel");
      // competitionId must be the category's REAL parent competition — the
      // archive drill-in target. Regression guard for the Home card that
      // previously linked /competitions/{categoryId} (wrong id space).
      expect(typeof first.competitionId).toBe("number");
      const parent = await getCompetition(first.competitionId, db);
      expect(parent).not.toBeNull();
      expect(parent?.categories.some((c) => c.id === first.categoryId)).toBe(
        true,
      );
    });
  });
});
