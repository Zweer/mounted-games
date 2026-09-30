import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sourceKind } from "./enums";

/**
 * Nations. Mounted Games home nations (`_england`/`_scotland`/`_wales`) are
 * modelled as first-class rows with their own codes — they compete as distinct
 * nations, so they are never merged into a `GB` parent.
 */
export const nation = sqliteTable("nation", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** ISO2 (`IT`, `FR`, ...) or a home-nation token (`england`, `scotland`, `wales`). */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

/**
 * Canonical game (standardized MG race). The join key for per-game stats.
 * Source/locale-specific spellings are resolved via `gameAlias`.
 */
export const game = sqliteTable("game", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  canonicalName: text("canonical_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
});

/**
 * Per-source raw game name → canonical `game`. mg headers are English, pmg game
 * names are Italian (via `acfGiocoLabels`); the ingester resolves a raw header
 * to a `game_id` through this alias, creating game + alias on first sight.
 */
export const gameAlias = sqliteTable(
  "game_alias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    source: text("source", { enum: sourceKind }).notNull(),
    rawName: text("raw_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
  },
  (t) => [unique("game_alias_source_norm_uq").on(t.source, t.normalizedName)],
);

/** Competition venue. Sparse (mg venue metadata is thin); referenced nullably. */
export const venue = sqliteTable("venue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  nationId: integer("nation_id").references(() => nation.id),
});
