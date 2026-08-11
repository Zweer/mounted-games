import { describe, expect, it } from "vitest";
import { parseEventIds } from "./mg-scoreboard";

describe("mg-scoreboard parseEventIds (seed crawl)", () => {
  it("collects distinct event ids from show_event links and ignores the rest", () => {
    // Arrange — an archive-like snippet with duplicate + non-event links.
    const html = `
      <div class="panel panel-default"><div class="list-group">
        <a class="list-group-item" href="index.php?seite=show_event&id=4388">RLT Wolteritz</a>
        <a class="list-group-item" href="?seite=show_event&id=4795&seite2=event_teams_show">U12</a>
        <a class="list-group-item" href="index.php?seite=show_event&id=4388">dup</a>
      </div></div>
      <a href="index.php?seite=archiv">Archive</a>
      <a href="?seite=team_profile&team_id=999">Team</a>`;

    // Act
    const ids = parseEventIds(html);

    // Assert — distinct event ids only, no team_id / archive links.
    expect(new Set(ids)).toEqual(new Set(["4388", "4795"]));
    expect(ids).toHaveLength(2);
  });
});
