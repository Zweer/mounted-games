import type { StandingsPayload } from "./types";

/**
 * Sample standings matching the Option C mockup — used by the dev-only Live
 * scoreboard preview and as a stable fixture while there is no live DB data.
 * NOT for production rendering.
 */
const GAMES = [
  "Speed weavers",
  "Toolbox scramble",
  "Association race",
  "Four flag",
] as const;

function row(
  participantId: number,
  label: string,
  nation: { code: string; name: string },
  rank: number,
  pointsTotal: number,
  games: number[],
): StandingsPayload["standings"][number] {
  return {
    participantId,
    type: "team",
    label,
    nation,
    rank,
    pointsTotal,
    games: GAMES.map((name, i) => ({ name, points: games[i] ?? 0 })),
  };
}

export const SAMPLE_STANDINGS: StandingsPayload = {
  category: {
    id: 0,
    competitionName: "European Team Championships 2026",
    label: "Under 12",
    format: "team",
    ageBand: "U12",
    pro: false,
  },
  phases: [
    { id: 1, kind: "session", ordinal: 1, label: "Session 1" },
    { id: 2, kind: "session", ordinal: 2, label: "Session 2" },
    { id: 3, kind: "session", ordinal: 3, label: "Session 3" },
    { id: 4, kind: "session", ordinal: 4, label: "Session 4" },
    { id: 5, kind: "final", ordinal: 1, label: "Final A" },
  ],
  activePhaseId: 4,
  standings: [
    row(
      1,
      "England U12",
      { code: "england", name: "England" },
      1,
      257,
      [16, 14, 12, 15],
    ),
    row(
      2,
      "Italy U12",
      { code: "IT", name: "Italy" },
      2,
      244,
      [14, 12, 15, 11],
    ),
    row(
      3,
      "Czech Republic U12",
      { code: "CZ", name: "Czech Republic" },
      3,
      238,
      [12, 15, 11, 13],
    ),
    row(
      4,
      "France U12",
      { code: "FR", name: "France" },
      4,
      230,
      [11, 13, 14, 10],
    ),
    row(
      5,
      "Germany U12",
      { code: "DE", name: "Germany" },
      5,
      221,
      [13, 10, 9, 14],
    ),
    row(
      6,
      "Austria U12",
      { code: "AT", name: "Austria" },
      6,
      210,
      [9, 11, 13, 8],
    ),
    row(
      7,
      "Wales U12",
      { code: "wales", name: "Wales" },
      7,
      205,
      [10, 9, 8, 12],
    ),
    row(
      8,
      "Scotland U12",
      { code: "scotland", name: "Scotland" },
      8,
      198,
      [8, 8, 10, 9],
    ),
  ],
  updatedAt: new Date("2026-08-11T13:00:00Z").toISOString(),
  isLive: true,
};
