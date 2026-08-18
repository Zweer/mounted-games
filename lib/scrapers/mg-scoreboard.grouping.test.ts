import { describe, expect, it } from "vitest";
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
