import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pmgLivescoreScraper } from "./pmglivescore";
import type { ScrapeContext } from "./types";

const FIXTURES = join(__dirname, "__fixtures__", "pmg");
const load = (name: string): string =>
  readFileSync(join(FIXTURES, `${name}.html`), "utf-8");

const BASE = "https://pmglivescore.altervista.org";
// Real post_ids captured from wp-json + live-* views (see docs/sources/pmglivescore.md).
const ctx = (slug: string, kind: string, postId: number): ScrapeContext => ({
  url: `${BASE}/${slug}/?post_id=${postId}`,
  kind,
});

describe("pmgLivescoreScraper.parse — classifica generale", () => {
  it("maps a COPPIE label to its 2-rider roster with ponies (post_id 47264)", () => {
    // Arrange
    const html = load("coppie-classifica");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("live-classifica-generale", "classifica", 47264),
    );
    // Assert
    expect(scrape.source).toBe("pmglivescore");
    expect(scrape.category.format).toBe("pair");
    expect(scrape.category.nativeId).toBe("47264");
    expect(scrape.competition.name).toBe("CAMPIONATI ITALIANI MG A COPPIE");

    const rusgheddu = scrape.participants.find((p) => p.label === "RUSGHEDDU");
    expect(rusgheddu).toBeDefined();
    expect(rusgheddu?.type).toBe("pair");
    expect(rusgheddu?.nation?.code).toBe("IT");
    expect(rusgheddu?.members).toHaveLength(2);
    expect(rusgheddu?.members[0]).toEqual({
      familyName: "FILIGHEDDU",
      givenName: "ANDREA MARIO",
      horse: "CANDY",
    });
  });

  it("maps a SQUADRE label to a ~5-rider roster (post_id 45941)", () => {
    // Arrange
    const html = load("squadre-classifica");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("live-classifica-generale", "classifica", 45941),
    );
    // Assert
    expect(scrape.category.format).toBe("team");
    const scudy = scrape.participants.find((p) => p.label === "SCUDY WE HOPE");
    expect(scudy).toBeDefined();
    expect(scudy?.type).toBe("team");
    expect(scudy?.members.length).toBeGreaterThanOrEqual(4);
    expect(scudy?.members[0]).toEqual({
      familyName: "LEONCAVALLO",
      givenName: "EDOARDO",
      horse: "MARLENE MONISCIONE",
    });
  });

  it("maps an INDIVIDUALI label (surname) to a 1-rider roster and parses decimal scores (post_id 47265)", () => {
    // Arrange
    const html = load("individuali-classifica");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("live-classifica-generale", "classifica", 47265),
    );
    // Assert — arity 1, label == surname
    expect(scrape.category.format).toBe("individual");
    const ghezzi = scrape.participants.find((p) => p.label === "GHEZZI");
    expect(ghezzi?.type).toBe("individual");
    expect(ghezzi?.members).toHaveLength(1);
    expect(ghezzi?.members[0].familyName).toBe("GHEZZI");
    expect(ghezzi?.members[0].horse).toBe("DONJA V.H.WOLFERSVEEN");

    // Decimal session score parsed as a number (40.1 in Sessione 1).
    const s1 = scrape.results.find(
      (r) => r.participantLabel === "GHEZZI" && r.phase.ordinal === 1,
    );
    expect(s1?.phase.kind).toBe("session");
    expect(s1?.pointsTotal).toBeCloseTo(40.1, 5);
    expect(typeof s1?.pointsTotal).toBe("number");

    // Overall rank attached to the decisive (last) phase result.
    const decisive = scrape.results
      .filter((r) => r.participantLabel === "GHEZZI")
      .at(-1);
    expect(decisive?.rank).toBe(1);
  });
});

describe("pmgLivescoreScraper.parse — batteria (per-game scores)", () => {
  it("resolves game names via acfGiocoLabels and emits per-game + total scores (post_id 47264, S1/B5)", () => {
    // Arrange
    const html = load("coppie-batteria");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("live-sessione1-batteria5", "batteria", 47264),
    );
    // Assert — phase from the URL slug
    expect(scrape.results.length).toBeGreaterThan(0);
    const first = scrape.results.find(
      (r) => r.participantLabel === "BERNI E RICHI",
    );
    expect(first).toBeDefined();
    expect(first?.phase).toMatchObject({
      kind: "session",
      ordinal: 1,
    });
    expect(first?.heatNumber).toBe(5);

    // acfGiocoLabels: s1b5_gioco_1 -> s1gioco1 -> "Slalom".
    const g1 = first?.games.find((g) => g.ordinal === 1);
    expect(g1?.game).toBe("Slalom");
    expect(typeof g1?.points).toBe("number");

    // A later game column also resolves by name (s1gioco8 -> "Three Pot Flag Race").
    const g8 = first?.games.find((g) => g.ordinal === 8);
    expect(g8?.game).toBe("Three Pot Flag Race");

    // Total is a parsed number and roster is present on the phase page too.
    expect(first?.pointsTotal).toBeGreaterThan(0);
    expect(scrape.participants.length).toBeGreaterThan(0);
  });
});

describe("pmgLivescoreScraper.parse — finale", () => {
  it("derives a final phase from the URL and reads per-game scores (post_id 47264, finale A)", () => {
    // Arrange
    const html = load("coppie-finale");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("live-finale-a", "finale", 47264),
    );
    // Assert
    expect(scrape.results.length).toBeGreaterThan(0);
    for (const r of scrape.results) {
      expect(r.phase.kind).toBe("final");
      expect(r.phase.label).toBe("Finale A");
      expect(r.phase.nativeParams).toMatchObject({ final: "A" });
    }
    expect(scrape.results[0].games.length).toBeGreaterThan(0);
  });
});

describe("pmgLivescoreScraper.parse — dispatch guard", () => {
  it("throws on an unsupported ctx.kind", () => {
    // Arrange
    const html = load("coppie-classifica");
    // Act / Assert
    expect(() =>
      pmgLivescoreScraper.parse(html, ctx("x", "unknown-kind", 47264)),
    ).toThrow(/unsupported ctx.kind/);
  });
});
