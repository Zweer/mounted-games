import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseInProgressCompetitions } from "./pmglivescore";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "__fixtures__", "pmg", name), "utf8");

describe("pmglivescore parseInProgressCompetitions (live list)", () => {
  it("returns only the in_corso cards, skipping programmata/conclusa", () => {
    // Arrange — the trimmed home has one in_corso card, one programmata, two
    // conclusa (see the fixture header note).
    const html = fixture("home.html");

    // Act
    const live = parseInProgressCompetitions(html);

    // Assert — exactly the single in-progress competition, with its name + url.
    expect(live).toHaveLength(1);
    expect(live[0].name).toBe("3ª TAPPA TROFEO FEDERALE MOUNTED GAMES");
    expect(live[0].url).toContain("/competizione/?competizione=");

    // The scheduled/concluded competitions are excluded.
    const names = live.map((c) => c.name);
    expect(names).not.toContain("CAMPIONATI ITALIANI MG A COPPIE"); // programmata
    expect(names).not.toContain("GOLD RIDERS ARENA"); // conclusa
    expect(names).not.toContain("2ª TAPPA TROFEO 4 REGIONI"); // conclusa
  });

  it("returns an empty list when no card is in progress", () => {
    // Arrange — a single concluded card.
    const html = `<div class="gara-item" data-competizione="X"
        data-url="https://pmglivescore.altervista.org/competizione/?competizione=X">
      <div class="gara-numero-gare">
        <span class="gara-stato gara-stato--conclusa">Conclusa</span>
      </div>
    </div>`;

    // Act + Assert
    expect(parseInProgressCompetitions(html)).toEqual([]);
  });
});
