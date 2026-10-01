import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { heat, phase } from "./competition";
import { participant } from "./participant";
import { game } from "./reference";

/**
 * Per-participant per-phase (optionally per-heat) score line.
 *
 * MONEY-AS-INTEGER-CENTS: scores are decimal at the source (pmg has 48.5, mg
 * pairs have penalty points), but SQLite has no exact decimal type. We store
 * points as INTEGER *cents* (48.50 → 4850); the read layer divides by 100 in one
 * place (`toNumber` in `lib/queries/standings.ts`) and ingest multiplies by 100
 * (`Math.round(x * 100)` in `lib/ingest/upsert.ts`). Integer comparisons make
 * ranking/tie logic exact — strictly more reliable than float.
 */
export const result = sqliteTable(
  "result",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phase.id, { onDelete: "cascade" }),
    heatId: integer("heat_id").references(() => heat.id, {
      onDelete: "cascade",
    }),
    /** Total points in integer cents (48.50 → 4850). */
    pointsTotalCents: integer("points_total_cents").notNull(),
    /** Penalty points in integer cents; null when the source has none. */
    penaltyPointsCents: integer("penalty_points_cents"),
    rank: integer("rank"),
    isTie: integer("is_tie", { mode: "boolean" }).default(false).notNull(),
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
export const gameResult = sqliteTable(
  "game_result",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    resultId: integer("result_id")
      .notNull()
      .references(() => result.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id),
    /** Per-game points in integer cents (see `result` for the cents rationale). */
    pointsCents: integer("points_cents").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [unique("game_result_result_game_uq").on(t.resultId, t.gameId)],
);
