import type { CompetitionFormat, PhaseKind } from "@/lib/scrapers/types";

/**
 * The shared read-model for a category's live/archive standings. Returned by
 * `getCategoryStandings`, served verbatim as JSON by `GET /api/live/[categoryId]`,
 * and consumed by the Live scoreboard UI. Numeric scores are already `number`
 * (integer cents divided by 100 at the query boundary — see `toNumber`).
 */

export interface StandingsNation {
  code: string;
  name: string;
}

export interface StandingsGameScore {
  /** Canonical game name (already resolved). */
  name: string;
  points: number;
}

export interface StandingsRow {
  participantId: number;
  type: CompetitionFormat;
  /** Display label: nation+category (team), rider name (individual), pair label (pair). */
  label: string;
  nation?: StandingsNation;
  rank: number | null;
  pointsTotal: number;
  penaltyPoints?: number | null;
  isTie?: boolean;
  /** Per-game breakdown for the selected phase (drill-in detail); empty for overall. */
  games: StandingsGameScore[];
}

export interface StandingsPhaseRef {
  id: number;
  kind: PhaseKind;
  ordinal: number;
  label: string;
}

export interface StandingsPayload {
  category: {
    id: number;
    competitionName: string;
    /** e.g. "Under 12" / "OPEN PRO". */
    label: string;
    format: CompetitionFormat;
    ageBand?: string | null;
    pro: boolean;
  };
  phases: StandingsPhaseRef[];
  activePhaseId: number;
  standings: StandingsRow[];
  /** ISO timestamp of the underlying data freshness. */
  updatedAt: string;
  /** Whether the category's competition is currently live (drives the LIVE cue + polling). */
  isLive: boolean;
}
