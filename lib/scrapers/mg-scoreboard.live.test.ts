import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCurrentEventIds, parseEventIds } from "./mg-scoreboard";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "__fixtures__", "mg", name), "utf8");

describe("mg-scoreboard parseCurrentEventIds (live list)", () => {
  it("returns only the Current competitions ids, excluding upcoming/archive", () => {
    // Arrange — the captured index has current=4863,4862; upcoming includes
    // 4857; archive includes 4811.
    const html = fixture("index-current.html");

    // Act
    const current = parseCurrentEventIds(html);

    // Assert — exactly the two currently-running events, in nav order.
    expect(current).toEqual(["4863", "4862"]);

    const set = new Set(current);
    expect(set.has("4857")).toBe(false); // upcoming
    expect(set.has("4811")).toBe(false); // archive

    // The current ids are a strict subset of a page-wide show_event scan.
    const all = new Set(parseEventIds(html));
    expect(all.has("4857")).toBe(true);
    expect(all.has("4811")).toBe(true);
    for (const id of current) expect(all.has(id)).toBe(true);
  });

  it("returns an empty list when there is no Current competitions group", () => {
    // Arrange — an archive fragment with no live dropdown.
    const html = `<ul class="nav"><li class="dropdown">
      <a class="dropdown-toggle">Archive</a>
      <ul class="dropdown-menu">
        <li><a href="?seite=show_event&id=4811">past</a></li>
      </ul></li></ul>`;

    // Act + Assert
    expect(parseCurrentEventIds(html)).toEqual([]);
  });
});
