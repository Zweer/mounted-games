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

describe("pmgLivescoreScraper.parse — competition dates (R1) + level (R3)", () => {
  it("extracts startsOn/endsOn from the .pmg-competition-dates header and infers national level", () => {
    // Arrange — a competizione-style page carrying the capitalized-month header.
    const html = load("coppie-competizione-dated");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("competizione", "classifica", 47264),
    );
    // Assert — R1: header "TORTONA • 21 Maggio 2026 - 24 Maggio 2026" → ISO range.
    expect(scrape.competition.startsOn).toBe("2026-05-21");
    expect(scrape.competition.endsOn).toBe("2026-05-24");
    // R3: CAMPIONATI ITALIANI marker → national.
    expect(scrape.competition.level).toBe("national");
  });

  it("leaves dates unset on a live-* page with no inline date (threaded from discovery instead)", () => {
    // Arrange — the classifica page carries only ACF title/category/modality.
    const html = load("coppie-classifica");
    // Act
    const scrape = pmgLivescoreScraper.parse(
      html,
      ctx("live-classifica-generale", "classifica", 47264),
    );
    // Assert — no inline date on this view; startsOn/endsOn stay undefined so
    // the DiscoveredTarget date (home-card .gara-date) fills them downstream.
    expect(scrape.competition.startsOn).toBeUndefined();
    expect(scrape.competition.endsOn).toBeUndefined();
    // Level is still inferred from the title (CAMPIONATI ITALIANI → national).
    expect(scrape.competition.level).toBe("national");
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

describe("pmgLivescoreScraper.discoverTargets", () => {
  it("enumerates a COPPIE category: classifica, batterie, semifinale, finale (post_id 47264)", () => {
    // Arrange / Act
    const targets = pmgLivescoreScraper.discoverTargets(
      load("coppie-classifica"),
      ctx("live-classifica-generale", "classifica", 47264),
    );
    // Assert
    const byKind = (k: string) => targets.filter((t) => t.kind === k);
    expect(byKind("classifica")).toHaveLength(1);
    expect(byKind("batteria")).toHaveLength(3);
    expect(byKind("semifinale")).toHaveLength(1);
    expect(byKind("finale")).toHaveLength(1);

    const urls = targets.map((t) => t.url);
    expect(urls).toContain(`${BASE}/live-sessione1-batteria5/?post_id=47264`);
    expect(urls).toContain(`${BASE}/live-sessione3-batteria5/?post_id=47264`);
    expect(urls).toContain(`${BASE}/live-finale-a/?post_id=47264`);
    expect(urls).toContain(`${BASE}/live-semifinale-inglese/?post_id=47264`);
    // Non-result views (Iscritti / Giochi / Info Gara) are excluded.
    expect(urls.some((u) => u.includes("giochi"))).toBe(false);
    expect(urls.some((u) => u.includes("iscritti"))).toBe(false);
    // De-duped by URL.
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("enumerates a SQUADRE category with no semifinale (post_id 45941)", () => {
    const targets = pmgLivescoreScraper.discoverTargets(
      load("squadre-classifica"),
      ctx("live-classifica-generale", "classifica", 45941),
    );

    expect(targets.filter((t) => t.kind === "batteria")).toHaveLength(3);
    expect(targets.filter((t) => t.kind === "semifinale")).toHaveLength(0);
    expect(targets.filter((t) => t.kind === "finale")).toHaveLength(1);

    const urls = targets.map((t) => t.url);
    expect(urls).toContain(`${BASE}/live-sessione1-batteria2/?post_id=45941`);
    expect(urls).toContain(`${BASE}/live-finale-a/?post_id=45941`);
    // post_id is carried onto the classifica link even though its nav href omits it.
    expect(urls).toContain(`${BASE}/live-classifica-generale/?post_id=45941`);
  });

  it("returns nothing when the URL carries no post_id", () => {
    const targets = pmgLivescoreScraper.discoverTargets(
      load("coppie-classifica"),
      { url: `${BASE}/live-classifica-generale/`, kind: "classifica" },
    );
    expect(targets).toEqual([]);
  });
});
