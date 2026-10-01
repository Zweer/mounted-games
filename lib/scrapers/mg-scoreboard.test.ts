import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mgScoreboardScraper,
  parseArchiveEntries,
  parseUpcomingEntries,
} from "./mg-scoreboard";
import type { ScrapeContext } from "./types";

const FIX = join(import.meta.dirname, "__fixtures__", "mg");
const read = (name: string): string => readFileSync(join(FIX, name), "utf8");

const parse = (name: string, ctx: ScrapeContext) =>
  mgScoreboardScraper.parse(read(name), ctx);

const BASE = "https://www.mg-scoreboard.de/index.php";

describe("mg-scoreboard parse — toplist", () => {
  it("parses a Team event: nation+category labels, home-nation flag, per-session games, rank", () => {
    const scrape = parse("team-toplist-4795.html", {
      url: `${BASE}?seite=show_event&id=4795&seite2=event_points_list_show`,
      kind: "toplist",
    });

    expect(scrape.source).toBe("mg-scoreboard");
    expect(scrape.category.format).toBe("team");
    expect(scrape.category.ageBand).toBe("U12");
    expect(scrape.category.division).toBe("a");
    expect(scrape.category.nativeId).toBe("4795");
    expect(scrape.competition.name).toContain("Team Championships");
    // grouping key drops the trailing "- Under 12a" suffix
    expect(scrape.competition.groupingKey).not.toContain("under 12a");

    const england = scrape.participants.find((p) => p.label === "England U12");
    expect(england).toBeDefined();
    expect(england?.type).toBe("team");
    // home-nation flag token → code "england"
    expect(england?.nation?.code).toBe("england");
    expect(england?.nation?.name).toBe("England");

    const italy = scrape.participants.find((p) => p.label === "Italy U12");
    expect(italy?.nation?.code).toBe("IT");

    const englandResult = scrape.results.find(
      (r) => r.participantLabel === "England U12",
    );
    expect(englandResult?.rank).toBe(1);
    expect(englandResult?.pointsTotal).toBe(257);
    // 4 per-session columns become "games", ordinal preserved
    expect(englandResult?.games).toHaveLength(4);
    expect(englandResult?.games[0]).toEqual({
      game: "Session 1",
      points: 62,
      ordinal: 1,
    });
  });

  it("parses an Individual event: rider-name labels and a named roster member", () => {
    const scrape = parse("individual-toplist-4629.html", {
      url: `${BASE}?seite=show_event&id=4629&seite2=event_points_list_show`,
      kind: "toplist",
    });

    expect(scrape.category.format).toBe("individual");
    expect(scrape.category.ageBand).toBe("U12");
    expect(scrape.category.division).toBeUndefined();

    const chloe = scrape.participants.find((p) => p.label === "Chloe LORENZON");
    expect(chloe).toBeDefined();
    expect(chloe?.type).toBe("individual");
    expect(chloe?.members).toEqual([
      { familyName: "LORENZON", givenName: "Chloe" },
    ]);

    const chloeResult = scrape.results.find(
      (r) => r.participantLabel === "Chloe LORENZON",
    );
    expect(chloeResult?.rank).toBe(1);
    expect(chloeResult?.pointsTotal).toBe(115);
  });

  it("parses a Pairs event: free-text pair label with nation flag", () => {
    const scrape = parse("pairs-toplist-4856.html", {
      url: `${BASE}?seite=show_event&id=4856&seite2=event_points_list_show`,
      kind: "toplist",
    });

    expect(scrape.category.format).toBe("pair");

    const pair = scrape.participants.find((p) => p.label === "EILEEN ET MEHDI");
    expect(pair).toBeDefined();
    expect(pair?.type).toBe("pair");
    expect(pair?.nation?.code).toBe("FR");
    // riders are never structured for pairs on mg → opaque roster
    expect(pair?.members).toEqual([]);

    const result = scrape.results.find(
      (r) => r.participantLabel === "EILEEN ET MEHDI",
    );
    expect(result?.pointsTotal).toBe(113);
  });
});

describe("mg-scoreboard parse — session", () => {
  it("parses per-game scores, penalty points and heat number for a Pairs session", () => {
    const scrape = parse("pairs-session-4856-s1.html", {
      url: `${BASE}?seite=show_event&id=4856&session=1`,
      kind: "session",
    });

    expect(scrape.category.format).toBe("pair");

    const results = scrape.results.filter(
      (r) => r.participantLabel === "Laura et Axel",
    );
    expect(results).toHaveLength(1);
    const r = results[0];

    expect(r.phase.kind).toBe("session");
    expect(r.phase.ordinal).toBe(1);
    expect(r.phase.nativeParams).toEqual({ session: 1 });
    expect(r.heatNumber).toBe(1);
    expect(r.pointsTotal).toBe(25);
    // Pairs sessions carry a Penalty Points column
    expect(r.penaltyPoints).toBe(0);

    // one score per game column, casing normalized, ordinal preserved
    const hilo = r.games.find((g) => g.game === "Hilo");
    expect(hilo).toEqual({ game: "Hilo", points: 1, ordinal: 1 });
    const socks = r.games.find((g) => g.game === "Socks and buckets");
    expect(socks?.points).toBe(6);
  });

  it("parses per-game scores for a Team session (single heat)", () => {
    const scrape = parse("team-session-4795-s1.html", {
      url: `${BASE}?seite=show_event&id=4795&session=1`,
      kind: "session",
    });

    expect(scrape.category.format).toBe("team");
    const cz = scrape.results.find(
      (r) => r.participantLabel === "Czech Republic U12",
    );
    expect(cz?.heatNumber).toBe(1);
    expect(cz?.pointsTotal).toBe(33);
    // no Penalty Points column in Team sessions
    expect(cz?.penaltyPoints).toBeUndefined();
    const speed = cz?.games.find((g) => g.game === "Speed weavers");
    expect(speed).toEqual({ game: "Speed weavers", points: 2, ordinal: 1 });
  });
});

describe("mg-scoreboard parse — teams", () => {
  it("extracts team_id per nation card, deduping responsive duplicates", () => {
    const scrape = parse("team-teams-4795.html", {
      url: `${BASE}?seite=show_event&id=4795&seite2=event_teams_show`,
      kind: "teams",
    });

    // 8 unique nations (cards are rendered twice for responsive layout)
    expect(scrape.participants).toHaveLength(8);
    const england = scrape.participants.find((p) => p.label === "England U12");
    expect(england?.nativeId).toBe("79");
    expect(england?.nation?.code).toBe("england");
    expect(england?.members).toEqual([]);
  });

  it("extracts per-rider team_id + start number for an Individual event", () => {
    const scrape = parse("individual-teams-4629.html", {
      url: `${BASE}?seite=show_event&id=4629&seite2=event_teams_show`,
      kind: "teams",
    });

    const adelaide = scrape.participants.find(
      (p) => p.label === "Adelaide Quaglia",
    );
    expect(adelaide?.nativeId).toBe("19067");
    expect(adelaide?.startNumber).toBe(4);
    expect(adelaide?.type).toBe("individual");
    expect(adelaide?.members).toEqual([
      { familyName: "Quaglia", givenName: "Adelaide" },
    ]);
  });
});

describe("mg-scoreboard parse — dispatch", () => {
  it("throws on an unsupported kind", () => {
    expect(() =>
      parse("team-toplist-4795.html", {
        url: `${BASE}?seite=show_event&id=4795`,
        kind: "weather",
      }),
    ).toThrow(/unsupported/);
  });
});

const discover = (name: string, ctx: ScrapeContext) =>
  mgScoreboardScraper.discoverTargets(read(name), ctx);

describe("mg-scoreboard discoverTargets", () => {
  it("enumerates a Team event: toplist, teams, sessions and finals (no semifinal)", () => {
    const targets = discover("team-toplist-4795.html", {
      url: `${BASE}?seite=show_event&id=4795&seite2=event_points_list_show`,
      kind: "toplist",
    });

    const byKind = (k: string) => targets.filter((t) => t.kind === k);
    expect(byKind("toplist")).toHaveLength(1);
    expect(byKind("teams")).toHaveLength(1);
    expect(byKind("session")).toHaveLength(4);
    expect(byKind("semifinal")).toHaveLength(0);
    expect(byKind("final")).toHaveLength(2);

    const urls = targets.map((t) => t.url);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4795&session=1`);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4795&session=4`);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4795&final=A&heat=1`);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4795&final=A&heat=2`);
    expect(urls).toContain(
      `${BASE}?seite=show_event&id=4795&seite2=event_teams_show`,
    );

    // De-duped by URL.
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("enumerates an Individual event: semifinal + tiered finals A..F", () => {
    const targets = discover("individual-toplist-4629.html", {
      url: `${BASE}?seite=show_event&id=4629&seite2=event_points_list_show`,
      kind: "toplist",
    });

    expect(targets.filter((t) => t.kind === "session")).toHaveLength(3);
    expect(targets.filter((t) => t.kind === "semifinal")).toHaveLength(1);
    // Tiered finals: one heat each of F..A.
    expect(targets.filter((t) => t.kind === "final")).toHaveLength(6);

    const urls = targets.map((t) => t.url);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4629&final=semifinal`);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4629&final=A&heat=1`);
    expect(urls).toContain(`${BASE}?seite=show_event&id=4629&final=F&heat=1`);
  });

  it("returns nothing when the URL carries no event id", () => {
    expect(
      discover("team-toplist-4795.html", { url: BASE, kind: "toplist" }),
    ).toEqual([]);
  });
});

/**
 * R1 date threading: the event page has no date, so the LIST parsers must
 * capture `startsOn` per event id and carry it onto the discovered target. The
 * 2026-09-30 re-verification clarified that the main `?seite=upcoming` panel
 * uses the archive's German-month + day-badge shape, while the inline
 * `D. Mon YY` is only in the nav dropdowns — so both parsers run over the
 * upcoming page and the archive path is what dates a main-panel event.
 */
describe("mg-scoreboard list parsers — date threading (R1)", () => {
  const upcoming = read("upcoming-list.html");

  it("archive-path parser dates the German-month main panel (heading + badge)", () => {
    const byId = new Map(
      parseArchiveEntries(upcoming).map((e) => [e.id, e.startsOn]),
    );
    // German month heading (Oktober/August) + day badge → ISO.
    expect(byId.get("5001")).toBe("2026-10-03");
    expect(byId.get("5003")).toBe("2026-10-12");
    expect(byId.get("5002")).toBe("2026-08-19");
  });

  it("upcoming-path parser dates ONLY the nav-dropdown inline `D. Mon YY` links", () => {
    const byId = new Map(
      parseUpcomingEntries(upcoming).map((e) => [e.id, e.startsOn]),
    );
    // Dropdown carries 5001 + 5002 inline; 5003 lives only in the main panel.
    expect(byId.get("5001")).toBe("2026-10-03");
    expect(byId.get("5002")).toBe("2026-08-19");
    expect(byId.get("5003")).toBeUndefined();
  });

  it("main-panel-only event (5003) is dated by the archive path, not the dropdown", () => {
    // The caveat's whole point: without running the archive path over the
    // upcoming page, 5003 would be seeded dateless.
    const archiveDate = new Map(
      parseArchiveEntries(upcoming).map((e) => [e.id, e.startsOn]),
    ).get("5003");
    const dropdownDate = new Map(
      parseUpcomingEntries(upcoming).map((e) => [e.id, e.startsOn]),
    ).get("5003");
    expect(archiveDate).toBe("2026-10-12");
    expect(dropdownDate).toBeUndefined();
  });
});
