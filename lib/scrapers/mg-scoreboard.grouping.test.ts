import { describe, expect, it } from "vitest";
import { normalizeKey } from "../normalize";
import { splitEventTitle } from "./mg-scoreboard";

/**
 * mg bakes the age band + format into the event title, so all age bands of one
 * real event must reduce to the same `base` (→ one competition) while the
 * per-band string survives as the category `label`.
 */
describe("splitEventTitle — mg base name + category label", () => {
  it("strips a trailing age-band suffix", () => {
    expect(splitEventTitle("World Team Championships 2026 - U18")).toEqual({
      base: "World Team Championships 2026",
      label: "U18",
    });
  });

  it("strips a trailing Open suffix", () => {
    expect(splitEventTitle("World Team Championships 2026 - Open")).toEqual({
      base: "World Team Championships 2026",
      label: "Open",
    });
  });

  it("strips a multi-word format suffix (Reserve Individuals)", () => {
    expect(
      splitEventTitle("World Team Championships 2026 - Reserve Individuals"),
    ).toEqual({
      base: "World Team Championships 2026",
      label: "Reserve Individuals",
    });
  });

  it("strips a trailing format word (Open Individuals)", () => {
    expect(splitEventTitle("Midlands Series (2) Open Individuals")).toEqual({
      base: "Midlands Series (2)",
      label: "Open Individuals",
    });
  });

  it("strips a prefix age band (spaced U 12)", () => {
    expect(splitEventTitle("U 12 WPC 2026")).toEqual({
      base: "WPC 2026",
      label: "U 12",
    });
  });

  it("all World-Championship age bands share one base (group together)", () => {
    const u18 = splitEventTitle("World Team Championships 2026 - U18").base;
    const open = splitEventTitle("World Team Championships 2026 - Open").base;
    const reserve = splitEventTitle(
      "World Team Championships 2026 - Reserve Individuals",
    ).base;
    expect(u18).toBe(open);
    expect(open).toBe(reserve);
  });

  it("keeps distinct editions apart (year stays in the base)", () => {
    const y24 = splitEventTitle("England Championships 2024 - U15").base;
    const y25 = splitEventTitle("England Championships 2025 - U15").base;
    expect(y24).not.toBe(y25);
  });

  it("leaves a bandless title untouched", () => {
    expect(splitEventTitle("Champions League")).toEqual({
      base: "Champions League",
    });
  });
});

/**
 * Validation against the 12 REAL current titles captured in the 2026-09-30
 * re-verification (docs/sources/mg-scoreboard.md § "mg TITLE / GROUPING"). Each
 * asserts the shared event `base` (→ groupingKey) so all age bands of one event
 * cluster onto one competition while distinct editions/events stay apart.
 */
describe("splitEventTitle — real re-verified titles (2026-09-30)", () => {
  const base = (t: string) => splitEventTitle(t).base;
  const key = (t: string) => normalizeKey(splitEventTitle(t).base);

  it("strips a spaced/suffixed 'Under 12a' band and keeps the year", () => {
    expect(
      splitEventTitle("IMGA European Team Championships 2026 - Under 12a"),
    ).toEqual({
      base: "IMGA European Team Championships 2026",
      label: "Under 12a",
    });
  });

  it("strips a suffix band with a mid-title 'Individual' format word", () => {
    expect(
      splitEventTitle("IMGA European Individual Championships 2026 - Under 15"),
    ).toEqual({
      base: "IMGA European Individual Championships 2026",
      label: "Under 15",
    });
  });

  it("clusters the World-Championships 2026 bands (U18 + Reserve) onto one key", () => {
    expect(key("World Team Championships 2026 - U18")).toBe(
      key("World Team Championships 2026 - Reserve Individuals"),
    );
  });

  it("clusters the WPC 2026 bands (prefix 'U 12' + prefix 'OPEN') onto one key", () => {
    // Prefix bands: `U 12 WPC 2026` and `OPEN WPC 2026` → shared base `WPC 2026`.
    expect(key("U 12 WPC 2026")).toBe(key("OPEN WPC 2026"));
    expect(base("U 12 WPC 2026")).toBe("WPC 2026");
  });

  it("strips a trailing German 'OK' (Offene Klasse) band", () => {
    expect(splitEventTitle("RLT Wittorfer Kibro's OK")).toEqual({
      base: "RLT Wittorfer Kibro's",
      label: "OK",
    });
  });

  it("strips a suffix band with no separator (…Championship 2026 U12)", () => {
    expect(splitEventTitle("Inter-counties Championship 2026 U12")).toEqual({
      base: "Inter-counties Championship 2026",
      label: "U12",
    });
  });

  it("strips a 'Musketeers' band", () => {
    expect(
      splitEventTitle("Intercounties Championships 2026 - Musketeers"),
    ).toEqual({
      base: "Intercounties Championships 2026",
      label: "Musketeers",
    });
  });

  it("strips the German 'Einsteiger' band + trailing format word (mid-title)", () => {
    // `Einsteiger` was added from the re-verification; without it this title's
    // band survived into the base and split the event across competitions.
    expect(splitEventTitle("OÖM - ÖM - Individuals - Einsteiger")).toEqual({
      base: "OÖM - ÖM",
      label: "Individuals Einsteiger",
    });
  });

  it("strips a 'Green Pony' band and 'Pairs' format word, keeps the leading year", () => {
    expect(splitEventTitle("2026 Southern Series Pairs - Green Pony")).toEqual({
      base: "2026 Southern Series",
      label: "Pairs Green Pony",
    });
  });

  it("strips a '25 & over' band", () => {
    expect(
      splitEventTitle("AMGA Individual Championship Camden 25 & over"),
    ).toEqual({
      base: "AMGA Individual Championship Camden",
      label: "25 & over",
    });
  });

  it("keeps distinct editions apart via the in-base year", () => {
    // Same event name, different years → different keys (no cross-year merge).
    expect(key("England Championships 2024 - U15")).not.toBe(
      key("England Championships 2025 - U15"),
    );
  });
});
