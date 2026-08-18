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
});
