import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  unique,
} from "drizzle-orm/pg-core";
import { heat, phase } from "./competition";
import { participant } from "./participant";
import { game } from "./reference";

/**
 * Per-participant per-phase (optionally per-heat) score line. Points are decimal
 * (pmg has 48.5, mg pairs have penalty points), so `numeric` for exactness.
 * The Drizzle read layer casts these strings back to numbers via a shared helper.
 */
export const result = pgTable(
  "result",
  {
    id: serial("id").primaryKey(),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phase.id, { onDelete: "cascade" }),
    heatId: integer("heat_id").references(() => heat.id, {
      onDelete: "cascade",
    }),
    pointsTotal: numeric("points_total", { precision: 6, scale: 2 }).notNull(),
    penaltyPoints: numeric("penalty_points", { precision: 6, scale: 2 }),
    rank: integer("rank"),
    isTie: boolean("is_tie").default(false).notNull(),
  },
  // NOTE: NULL heat_id rows are distinct under a plain unique index; a partial
  // index can enforce the coalesce(heat_id) semantics later if needed.
  (t) => [
    unique("result_participant_phase_heat_uq").on(
      t.participantId,
      t.phaseId,
      t.heatId,
    ),
  ],
);

/** Per-game breakdown of a `result`. `ordinal` preserves the source column order. */
export const gameResult = pgTable(
  "game_result",
  {
    id: serial("id").primaryKey(),
    resultId: integer("result_id")
      .notNull()
      .references(() => result.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id),
    points: numeric("points", { precision: 6, scale: 2 }).notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [unique("game_result_result_game_uq").on(t.resultId, t.gameId)],
);
