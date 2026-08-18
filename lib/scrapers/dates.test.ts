import { describe, expect, it } from "vitest";
import {
  parseDateRange,
  parseListDate,
  parseTextDate,
  parseUpcomingDate,
} from "./dates";

describe("parseListDate — mg archive month panel + day badge", () => {
  it("parses an English month heading", () => {
    expect(parseListDate("August 2026", "03")).toBe("2026-08-03");
  });

  it("parses a German month heading (headings stay German)", () => {
    expect(parseListDate("Juli 2026", "10")).toBe("2026-07-10");
    expect(parseListDate("Mai 2026", "1")).toBe("2026-05-01");
  });

  it("returns null for an unrecognized heading or day", () => {
    expect(parseListDate("Sometime 2026", "03")).toBeNull();
    expect(parseListDate("August", "03")).toBeNull();
    expect(parseListDate("August 2026", "99")).toBeNull();
  });
});

describe("parseUpcomingDate — mg upcoming inline date", () => {
  it("parses `19. Aug 26` with a 2-digit year", () => {
    expect(parseUpcomingDate("OPEN WPC 2026 - 19. Aug 26")).toBe("2026-08-19");
  });

  it("returns null when there is no date", () => {
    expect(parseUpcomingDate("Some Event Without A Date")).toBeNull();
  });
});

describe("parseTextDate / parseDateRange — pmg Italian card dates", () => {
  it("parses a single Italian text date", () => {
    expect(parseTextDate("20 Giugno 2026")).toBe("2026-06-20");
  });

  it("parses a date range into start + end", () => {
    expect(parseDateRange("20 Giugno 2026 - 21 Giugno 2026")).toEqual({
      startsOn: "2026-06-20",
      endsOn: "2026-06-21",
    });
  });

  it("parses a single-date card into just startsOn", () => {
    expect(parseDateRange("20 Giugno 2026")).toEqual({
      startsOn: "2026-06-20",
    });
  });

  it("returns an empty object for unparseable input", () => {
    expect(parseDateRange("")).toEqual({});
  });
});
