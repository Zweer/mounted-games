import { describe, expect, it } from "vitest";
import {
  parseDateRange,
  parseGermanListDate,
  parseItalianMonthDate,
  parseItalianNumericDate,
  parseListDate,
  parseTextDate,
  parseUpcomingDate,
} from "./dates";

describe("parseGermanListDate — (month, day, year) archive/upcoming panel shape", () => {
  it("parses a German month name + separate day + year", () => {
    expect(parseGermanListDate("Oktober", "03", "2026")).toBe("2026-10-03");
    expect(parseGermanListDate("März", 7, 2026)).toBe("2026-03-07");
  });

  it("also accepts an English month name (archive headings can be either)", () => {
    expect(parseGermanListDate("August", "19", "2026")).toBe("2026-08-19");
  });

  it("returns null for an unknown month or out-of-range day", () => {
    expect(parseGermanListDate("Nonemonth", "03", "2026")).toBeNull();
    expect(parseGermanListDate("August", "99", "2026")).toBeNull();
  });
});

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

describe("parseItalianMonthDate — pmg capitalized-month card/header dates", () => {
  it("parses a capitalized Italian month date", () => {
    expect(parseItalianMonthDate("21 Maggio 2026")).toBe("2026-05-21");
    expect(parseItalianMonthDate("30 Aprile 2026")).toBe("2026-04-30");
    expect(parseItalianMonthDate("1 Febbraio 2026")).toBe("2026-02-01");
  });

  it("is the implementation behind parseTextDate", () => {
    expect(parseTextDate("20 Giugno 2026")).toBe(
      parseItalianMonthDate("20 Giugno 2026"),
    );
  });

  it("returns null for an unknown month or malformed input", () => {
    expect(parseItalianMonthDate("21 Smurfember 2026")).toBeNull();
    expect(parseItalianMonthDate("Maggio 2026")).toBeNull();
    expect(parseItalianMonthDate("")).toBeNull();
  });
});

describe("parseItalianNumericDate — pmg live-info-gara DD/MM/YYYY", () => {
  it("parses a DD/MM/YYYY numeric date", () => {
    expect(parseItalianNumericDate("21/06/2026")).toBe("2026-06-21");
    expect(parseItalianNumericDate("01/03/2026")).toBe("2026-03-01");
  });

  it("tolerates dot / dash separators and a 2-digit year", () => {
    expect(parseItalianNumericDate("21.06.2026")).toBe("2026-06-21");
    expect(parseItalianNumericDate("21-06-2026")).toBe("2026-06-21");
    expect(parseItalianNumericDate("21/06/26")).toBe("2026-06-21");
  });

  it("returns null for an out-of-range or malformed date", () => {
    expect(parseItalianNumericDate("32/06/2026")).toBeNull();
    expect(parseItalianNumericDate("21/13/2026")).toBeNull();
    expect(parseItalianNumericDate("not a date")).toBeNull();
    expect(parseItalianNumericDate("")).toBeNull();
  });
});

describe("parseDateRange — mixed numeric / month forms", () => {
  it("parses a DD/MM/YYYY range (live-info-gara Inizio - Fine)", () => {
    expect(parseDateRange("21/05/2026 - 24/05/2026")).toEqual({
      startsOn: "2026-05-21",
      endsOn: "2026-05-24",
    });
  });

  it("parses a capitalized-month range crossing months", () => {
    expect(parseDateRange("30 Aprile 2026 - 3 Maggio 2026")).toEqual({
      startsOn: "2026-04-30",
      endsOn: "2026-05-03",
    });
  });
});
