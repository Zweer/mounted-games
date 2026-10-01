import { describe, expect, it } from "vitest";
import { inferLevel } from "./level";

describe("inferLevel — conservative title-based classification", () => {
  it("classifies international events", () => {
    expect(
      inferLevel("IMGA European Team Championships 2026", "mg-scoreboard"),
    ).toBe("international");
    expect(inferLevel("World Team Championships 2026", "mg-scoreboard")).toBe(
      "international",
    );
    expect(inferLevel("OPEN WPC 2026", "mg-scoreboard")).toBe("international");
    expect(inferLevel("Home International 2024 - U15s", "mg-scoreboard")).toBe(
      "international",
    );
  });

  it("classifies national championships", () => {
    expect(
      inferLevel("Deutsche Einzelmeisterschaft 2022", "mg-scoreboard"),
    ).toBe("national");
    expect(
      inferLevel("England Championships 2024 - U15", "mg-scoreboard"),
    ).toBe("national");
    expect(
      inferLevel("Championnat de France en paire élite", "mg-scoreboard"),
    ).toBe("national");
    expect(inferLevel("CAMPIONATI ITALIANI MG A SQUADRE", "pmglivescore")).toBe(
      "national",
    );
  });

  it("classifies regional series / state comps", () => {
    expect(inferLevel("RLT Sehlis OK", "mg-scoreboard")).toBe("regional");
    expect(inferLevel("Midlands Series (1) Open", "mg-scoreboard")).toBe(
      "regional",
    );
    expect(
      inferLevel("MGAWA State Pairs Championships 2026", "mg-scoreboard"),
    ).toBe("regional");
  });

  it("returns null when not confident", () => {
    expect(inferLevel("STRUK Summer Tournament", "mg-scoreboard")).toBeNull();
    expect(inferLevel("HOYS Naylors Cup", "mg-scoreboard")).toBeNull();
  });

  it("classifies real re-verified titles (2026-09-30) by tier", () => {
    // international: IMGA / World / WPC / European
    expect(
      inferLevel(
        "IMGA European Team Championships 2026 - Under 12a",
        "mg-scoreboard",
      ),
    ).toBe("international");
    expect(inferLevel("U 12 WPC 2026", "mg-scoreboard")).toBe("international");
    expect(inferLevel("OPEN WPC 2026", "mg-scoreboard")).toBe("international");
    // regional: RLT + Intercounties + Southern Series
    expect(inferLevel("RLT Wittorfer Kibro's OK", "mg-scoreboard")).toBe(
      "regional",
    );
    expect(
      inferLevel("Inter-counties Championship 2026 U12", "mg-scoreboard"),
    ).toBe("regional");
    expect(
      inferLevel("2026 Southern Series Pairs - Green Pony", "mg-scoreboard"),
    ).toBe("regional");
    // ambiguous → null (AMGA with no region/national marker, Austrian ÖM abbrev)
    expect(
      inferLevel(
        "AMGA Individual Championship Camden 25 & over",
        "mg-scoreboard",
      ),
    ).toBeNull();
    expect(
      inferLevel("OÖM - ÖM - Individuals - Einsteiger", "mg-scoreboard"),
    ).toBeNull();
  });
});
